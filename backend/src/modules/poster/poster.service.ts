import { getPrisma } from '../../shared/database.js';
import * as configService from '../config/config.service.js';
import * as auditService from '../audit/audit.service.js';
import { NotFoundError, BusinessError } from '../../shared/errors.js';
import logger from '../../shared/logger.js';
import { decrypt } from '../../shared/encryption.js';

// In-memory token cache (per process, keyed by accountId)
const _bkTokens: Record<string, string> = {};

interface BkApiResponse {
  status: number;
  message?: string;
  data?: any;
}

interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

interface PreflightResult {
  success: boolean;
  typeid?: string;
  error?: string;
}

interface ThreadItem {
  tid: number;
  subject: string;
  replies: number;
  author: string;
  lastpost: string;
}

/**
 * Post an approved feed to BK Forum.
 * Full flow: auth -> preflight -> rate limit -> post -> record.
 * Matches original GAS BKForumPoster.js logic exactly.
 */
export async function postFeed(feedId: string, userId?: string, ip?: string) {
  const prisma = getPrisma();

  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'approved') throw new BusinessError('Can only post approved feeds');

  const content = feed.finalContent || feed.draftContent;
  if (!content) throw new BusinessError('Feed has no content to post');

  const persona = await prisma.persona.findFirst({ where: { accountId: feed.personaId ?? undefined } });
  if (!persona) throw new BusinessError('Persona not found');

  const baseUrl = await configService.getValue('BK_BASE_URL');

  if (!baseUrl) {
    return mockPost(feed, persona, userId, ip);
  }

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';
  const rateLimitSec = parseInt(await configService.getValue('BK_RATE_LIMIT_SECONDS') || '35', 10);

  try {
    // 1. Rate limiting -- wait if cooldown active
    await enforceRateLimit(persona, rateLimitSec);

    // 2. Login
    const token = await ensureBkLogin(persona, baseUrl, bkApp, bkVer);

    // 3. Preflight for new threads (get typeid)
    let typeid = '';
    if (feed.postType === 'new-post' && feed.threadFid) {
      const preflight = await preflightCheck(baseUrl, token, feed.threadFid, bkApp, bkVer);
      if (!preflight.success) throw new Error(preflight.error);
      typeid = preflight.typeid!;
    }

    // 4. Post
    const result = feed.postType === 'new-post'
      ? await postNewThread(baseUrl, token, feed, content, typeid, bkApp, bkVer)
      : await postReply(baseUrl, token, feed, content, bkApp, bkVer);

    if (!result.success) throw new Error(result.error);

    // 5. Record success
    const updatedFeed = await prisma.feed.update({
      where: { id: feed.id },
      data: {
        status: 'posted',
        postedAt: new Date(),
        postId: result.postId,
        postUrl: result.postUrl || '',
      },
    });

    await prisma.persona.update({
      where: { id: persona.id },
      data: {
        postsToday: (persona.postsToday || 0) + 1,
        lastPostAt: new Date(),
        cooldownUntil: new Date(Date.now() + rateLimitSec * 1000),
      },
    });

    await auditService.log({
      operator: userId || 'system', eventType: 'FEED_POSTED', module: 'poster',
      feedId: feed.feedId, bkUsername: persona.username, ip, apiStatus: 200,
      actionDetail: `${feed.postType} posted. FID: ${feed.threadFid} | Post ID: ${result.postId}`,
      session: userId ? 'admin' : 'worker',
    });

    return updatedFeed;
  } catch (err: any) {
    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        status: 'failed',
        failReason: err.message,
      },
    });

    await auditService.log({
      operator: userId || 'system', eventType: 'BK_POST_FAILED', module: 'poster',
      feedId: feed.feedId, bkUsername: persona.username, ip,
      actionDetail: `Post failed: ${err.message}`,
      session: userId ? 'admin' : 'worker',
    });

    throw err;
  }
}

// --- BK Account Auth (matches GAS _ensureBkLogin) ---

async function ensureBkLogin(persona: any, baseUrl: string, bkApp: string, bkVer: string): Promise<string> {
  const prisma = getPrisma();

  // Check in-memory cache first
  if (_bkTokens[persona.accountId]) return _bkTokens[persona.accountId];

  // Check DB cached token
  if (persona.bkToken && persona.bkTokenExpiry > new Date()) {
    _bkTokens[persona.accountId] = persona.bkToken;
    return persona.bkToken;
  }

  if (!persona.bkPassword) throw new Error(`Password not set for ${persona.accountId}`);

  let password: string;
  try {
    password = decrypt(persona.bkPassword);
  } catch {
    throw new Error(`Failed to decrypt password for ${persona.accountId}`);
  }

  const params = new URLSearchParams({
    mod: 'member', op: 'login',
    username: persona.username,
    password,
    app: bkApp, ver: bkVer,
  });

  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(10000),
  });

  const body = await resp.json() as BkApiResponse;

  if (body.status !== 1) {
    throw new Error(`BK login failed for ${persona.username}: ${body.message || 'Unknown error'}`);
  }

  const token = body.data?.token;
  const uid = body.data?.uid;

  _bkTokens[persona.accountId] = token;

  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      bkToken: token,
      bkUid: uid,
      bkTokenExpiry: new Date(Date.now() + 24 * 3600 * 1000),
      tokenStatus: 'active',
    },
  });

  await auditService.log({
    operator: 'system', eventType: 'BK_POST_SUCCESS', module: 'poster',
    bkUsername: persona.username, actionDetail: `BK login OK. UID: ${uid}`,
    apiStatus: 200, session: 'worker',
  });

  return token;
}

// --- Preflight check (matches GAS _preflightCheck) ---

async function preflightCheck(baseUrl: string, token: string, fid: number, bkApp: string, bkVer: string): Promise<PreflightResult> {
  const params = new URLSearchParams({
    mod: 'forum', op: 'forumdisplay', fid: String(fid),
    token, app: bkApp, ver: bkVer,
  });

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status !== 1) return { success: false, error: `Preflight failed: ${body.message}` };

    const forum = body.data?.forum;
    if (!forum) return { success: false, error: 'Forum metadata not returned' };

    const requiredType = Number(forum.requiredtype) || 0;
    if (requiredType === 0) return { success: true, typeid: '' };

    const threadTypes = forum.threadtypes || {};
    const typeids = Object.keys(threadTypes);
    if (typeids.length === 0) return { success: false, error: 'Forum requires typeid but none available' };

    return { success: true, typeid: typeids[0] };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// --- Post new thread (matches GAS _postNewThread with retry) ---

async function postNewThread(baseUrl: string, token: string, feed: any, content: string, typeid: string, bkApp: string, bkVer: string, retryCount = 0): Promise<PostResult> {
  const paramObj: Record<string, string> = {
    mod: 'forum', op: 'newthread',
    fid: String(feed.threadFid), token,
    subject: feed.subject || feed.threadSubject,
    message: content,
    app: bkApp, ver: bkVer,
  };
  if (typeid) paramObj.typeid = typeid;

  const params = new URLSearchParams(paramObj);

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status === 1) {
      return { success: true, postId: body.data?.tid || 'unknown', postUrl: '' };
    }

    // Rate limit retry (max 2 retries, 32s sleep -- matches GAS)
    if (String(body.message).includes('\u767c\u5e16\u904e\u65bc\u983b\u7e41') && retryCount < 2) {
      logger.info({ retryCount }, 'Rate limited by BK, waiting 32s before retry');
      await new Promise((resolve) => setTimeout(resolve, 32000));
      return postNewThread(baseUrl, token, feed, content, typeid, bkApp, bkVer, retryCount + 1);
    }

    return { success: false, error: body.message || 'Post failed' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// --- Post reply (matches GAS _postReply with retry) ---

async function postReply(baseUrl: string, token: string, feed: any, content: string, bkApp: string, bkVer: string, retryCount = 0): Promise<PostResult> {
  const params = new URLSearchParams({
    mod: 'forum', op: 'newreply',
    tid: String(feed.threadTid), fid: String(feed.threadFid),
    token, message: content,
    app: bkApp, ver: bkVer,
  });

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status === 1) {
      return { success: true, postId: body.data?.pid || 'unknown', postUrl: '' };
    }

    // Rate limit retry (max 2 retries, 32s sleep)
    if (String(body.message).includes('\u767c\u5e16\u904e\u65bc\u983b\u7e41') && retryCount < 2) {
      logger.info({ retryCount }, 'Rate limited by BK, waiting 32s before retry');
      await new Promise((resolve) => setTimeout(resolve, 32000));
      return postReply(baseUrl, token, feed, content, bkApp, bkVer, retryCount + 1);
    }

    return { success: false, error: body.message || 'Reply failed' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// --- Rate limiting (matches GAS _enforceRateLimit) ---

async function enforceRateLimit(persona: any, rateLimitSec: number): Promise<void> {
  if (!persona.cooldownUntil || persona.cooldownUntil <= new Date()) return;

  const waitMs = persona.cooldownUntil.getTime() - Date.now();
  if (waitMs <= 0) return;

  logger.info({ personaId: persona.accountId, waitMs: Math.ceil(waitMs / 1000) + 's' }, 'Rate limit cooldown');
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

// --- Forum index sync (fetch from BK API and update DB) ---

export async function syncForumIndex() {
  const prisma = getPrisma();

  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return { success: false as const, error: 'BK_BASE_URL not configured' };

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  const params = new URLSearchParams({ mod: 'forum', op: 'index', app: bkApp, ver: bkVer });

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status !== 1) return { success: false as const, error: body.message };

    const groups = body.data?.lists || [];
    let updated = 0;
    let created = 0;

    for (const group of groups) {
      const categoryName = group.name || '';
      // Upsert category
      let category = await prisma.forumCategory.findFirst({ where: { name: categoryName } });
      if (!category) {
        category = await prisma.forumCategory.create({ data: { name: categoryName } });
      }

      const subforums = group.subforums || [];
      for (const sf of subforums) {
        const fid = parseInt(sf.fid, 10);
        const name = sf.name || '';
        if (!fid || !name) continue;

        // Try match by name first (fix wrong FID), then by fid
        const existingByName = await prisma.forumBoard.findFirst({ where: { name } });
        if (existingByName) {
          if (existingByName.fid !== fid) {
            // Remove conflicting board with same fid (if any) before updating
            await prisma.forumBoard.deleteMany({ where: { fid, id: { not: existingByName.id } } });
            logger.info({ name, oldFid: existingByName.fid, newFid: fid }, 'syncForumIndex: updating FID');
            await prisma.forumBoard.update({
              where: { id: existingByName.id },
              data: { fid, categoryId: category.id },
            });
            updated++;
          }
        } else {
          const existingByFid = await prisma.forumBoard.findFirst({ where: { fid } });
          if (existingByFid) {
            await prisma.forumBoard.update({
              where: { id: existingByFid.id },
              data: { name, categoryId: category.id },
            });
            updated++;
          } else {
            await prisma.forumBoard.create({
              data: {
                categoryId: category.id,
                name,
                fid,
                isActive: true,
                enableScraping: false,
              },
            });
            created++;
          }
        }
      }
    }

    logger.info({ updated, created }, 'syncForumIndex complete');
    return { success: true as const, updated, created, message: `Updated ${updated}, created ${created} boards` };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}

// --- BK Forum read APIs (for Scanner) ---

export async function fetchThreadList(fid: number): Promise<ThreadItem[]> {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return mockThreadList();

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  // Use any cached token for read access
  const cachedToken = Object.values(_bkTokens)[0] || '';

  const paramObj: Record<string, string> = {
    mod: 'forum', op: 'forumdisplay',
    fid: String(fid), orderby: 'lastpost', page: '1',
    app: bkApp, ver: bkVer,
  };
  if (cachedToken) paramObj.token = cachedToken;

  const params = new URLSearchParams(paramObj);

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status !== 1) return [];

    // BK API returns threads under different keys
    const threads = body.data?.lists || body.data?.threads || body.data?.list || body.data?.threadlist || [];

    return threads.map((t: any) => ({
      tid: parseInt(t.tid, 10),
      subject: t.subject || '',
      replies: parseInt(t.replies || '0', 10),
      author: t.author || '',
      lastpost: t.lastpost || '',
    }));
  } catch (err) {
    logger.warn({ err, fid }, 'Failed to fetch thread list');
    return [];
  }
}

export async function fetchThreadContent(tid: number): Promise<string | null> {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return 'Mock thread content for testing.';

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';
  const cachedToken = Object.values(_bkTokens)[0] || '';

  const paramObj: Record<string, string> = {
    mod: 'forum', op: 'viewthread',
    tid: String(tid), page: '1',
    app: bkApp, ver: bkVer,
  };
  if (cachedToken) paramObj.token = cachedToken;

  const params = new URLSearchParams(paramObj);

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.json() as BkApiResponse;

    if (body.status !== 1) return null;

    const posts = body.data?.posts || body.data?.list || body.data?.postlist || body.data?.lists || [];
    if (!posts.length) return null;

    // Take OP + first 3 replies, strip HTML
    return posts.slice(0, 4)
      .map((p: any) => stripHtml(p.message || ''))
      .join('\n\n');
  } catch (err) {
    logger.warn({ err, tid }, 'Failed to fetch thread content');
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function mockThreadList(): ThreadItem[] {
  return [
    { tid: 23900001, subject: '幼稚園面試心得分享', replies: 15, author: 'test', lastpost: '' },
    { tid: 23900002, subject: '母乳餵哺遇到困難', replies: 8, author: 'test', lastpost: '' },
    { tid: 23900003, subject: '湊仔經好攰但好值得', replies: 25, author: 'test', lastpost: '' },
  ];
}

async function mockPost(feed: any, persona: any, userId: string | undefined, ip: string | undefined) {
  const prisma = getPrisma();

  logger.info({ feedId: feed.feedId }, 'Mock posting feed (BK_BASE_URL not configured)');

  const updatedFeed = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'posted',
      postedAt: new Date(),
      postId: `mock-${Date.now()}`,
    },
  });

  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      postsToday: (persona.postsToday || 0) + 1,
      lastPostAt: new Date(),
    },
  });

  await auditService.log({
    operator: userId || 'system', eventType: 'FEED_POSTED', module: 'poster',
    feedId: feed.feedId, bkUsername: persona.username, ip,
    actionDetail: `Posted feed ${feed.feedId} (mock)`, session: userId ? 'admin' : 'worker',
  });

  return updatedFeed;
}

// --- Poster history ---

export async function getHistory({ page = 1, limit = 20 }: { page?: number; limit?: number }) {
  const prisma = getPrisma();

  const skip = (page - 1) * limit;
  const where = { status: { in: ['posted', 'failed'] } };
  const [data, total] = await Promise.all([
    prisma.feed.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        feedId: true,
        threadSubject: true,
        personaId: true,
        bkUsername: true,
        status: true,
        postedAt: true,
        failReason: true,
        postId: true,
      },
    }),
    prisma.feed.count({ where }),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Get approved feeds waiting to be posted (pending queue).
 */
export async function getPending() {
  const prisma = getPrisma();
  const data = await prisma.feed.findMany({
    where: { status: 'approved', postId: null },
    orderBy: { reviewedAt: 'asc' },
    select: {
      id: true,
      feedId: true,
      threadSubject: true,
      threadFid: true,
      personaId: true,
      bkUsername: true,
      type: true,
      status: true,
      reviewedAt: true,
    },
  });
  return data;
}
