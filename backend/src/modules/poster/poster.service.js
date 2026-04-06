import Feed from '../feed/feed.model.js';
import Persona from '../persona/persona.model.js';
import * as configService from '../config/config.service.js';
import * as auditService from '../audit/audit.service.js';
import { NotFoundError, BusinessError } from '../../shared/errors.js';
import logger from '../../shared/logger.js';

// In-memory token cache (per process, keyed by accountId)
const _bkTokens = {};

/**
 * Post an approved feed to BK Forum.
 * Full flow: auth → preflight → rate limit → post → record.
 * Matches original GAS BKForumPoster.js logic exactly.
 */
export async function postFeed(feedId, userId, ip) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'approved') throw new BusinessError('Can only post approved feeds');

  const content = feed.finalContent || feed.draftContent;
  if (!content) throw new BusinessError('Feed has no content to post');

  const persona = await Persona.findOne({ accountId: feed.personaId });
  if (!persona) throw new BusinessError('Persona not found');

  const baseUrl = await configService.getValue('BK_BASE_URL');

  if (!baseUrl) {
    return mockPost(feed, persona, userId, ip);
  }

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';
  const rateLimitSec = parseInt(await configService.getValue('BK_RATE_LIMIT_SECONDS') || '35', 10);

  try {
    // 1. Rate limiting — wait if cooldown active
    await enforceRateLimit(persona, rateLimitSec);

    // 2. Login
    const token = await ensureBkLogin(persona, baseUrl, bkApp, bkVer);

    // 3. Preflight for new threads (get typeid)
    let typeid = '';
    if (feed.postType === 'new-post' && feed.threadFid) {
      const preflight = await preflightCheck(baseUrl, token, feed.threadFid, bkApp, bkVer);
      if (!preflight.success) throw new Error(preflight.error);
      typeid = preflight.typeid;
    }

    // 4. Post
    const result = feed.postType === 'new-post'
      ? await postNewThread(baseUrl, token, feed, content, typeid, bkApp, bkVer)
      : await postReply(baseUrl, token, feed, content, bkApp, bkVer);

    if (!result.success) throw new Error(result.error);

    // 5. Record success
    feed.status = 'posted';
    feed.postedAt = new Date();
    feed.postId = result.postId;
    feed.postUrl = result.postUrl || '';
    await feed.save();

    persona.postsToday = (persona.postsToday || 0) + 1;
    persona.lastPostAt = new Date();
    persona.cooldownUntil = new Date(Date.now() + rateLimitSec * 1000);
    await persona.save();

    await auditService.log({
      operator: userId || 'system', eventType: 'FEED_POSTED', module: 'poster',
      feedId: feed.feedId, bkUsername: persona.username, ip, apiStatus: 200,
      actionDetail: `${feed.postType} posted. FID: ${feed.threadFid} | Post ID: ${result.postId}`,
      session: userId ? 'admin' : 'worker',
    });

    return feed;
  } catch (err) {
    feed.status = 'failed';
    feed.failReason = err.message;
    await feed.save();

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

async function ensureBkLogin(persona, baseUrl, bkApp, bkVer) {
  // Check in-memory cache first
  if (_bkTokens[persona.accountId]) return _bkTokens[persona.accountId];

  // Check DB cached token
  if (persona.bkToken && persona.bkTokenExpiry > new Date()) {
    _bkTokens[persona.accountId] = persona.bkToken;
    return persona.bkToken;
  }

  if (!persona.bkPassword) throw new Error(`Password not set for ${persona.accountId}`);

  const params = new URLSearchParams({
    mod: 'member', op: 'login',
    username: persona.username,
    password: persona.bkPassword,
    app: bkApp, ver: bkVer,
  });

  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(10000),
  });

  const body = await resp.json();

  if (body.status !== 1) {
    throw new Error(`BK login failed for ${persona.username}: ${body.message || 'Unknown error'}`);
  }

  const token = body.data?.token;
  const uid = body.data?.uid;

  _bkTokens[persona.accountId] = token;

  persona.bkToken = token;
  persona.bkUid = uid;
  persona.bkTokenExpiry = new Date(Date.now() + 24 * 3600 * 1000);
  persona.tokenStatus = 'active';
  await persona.save();

  await auditService.log({
    operator: 'system', eventType: 'BK_POST_SUCCESS', module: 'poster',
    bkUsername: persona.username, actionDetail: `BK login OK. UID: ${uid}`,
    apiStatus: 200, session: 'worker',
  });

  return token;
}

// --- Preflight check (matches GAS _preflightCheck) ---

async function preflightCheck(baseUrl, token, fid, bkApp, bkVer) {
  const params = new URLSearchParams({
    mod: 'forum', op: 'forumdisplay', fid: String(fid),
    token, app: bkApp, ver: bkVer,
  });

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.json();

    if (body.status !== 1) return { success: false, error: `Preflight failed: ${body.message}` };

    const forum = body.data?.forum;
    if (!forum) return { success: false, error: 'Forum metadata not returned' };

    const requiredType = Number(forum.requiredtype) || 0;
    if (requiredType === 0) return { success: true, typeid: '' };

    const threadTypes = forum.threadtypes || {};
    const typeids = Object.keys(threadTypes);
    if (typeids.length === 0) return { success: false, error: 'Forum requires typeid but none available' };

    return { success: true, typeid: typeids[0] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- Post new thread (matches GAS _postNewThread with retry) ---

async function postNewThread(baseUrl, token, feed, content, typeid, bkApp, bkVer, retryCount = 0) {
  const paramObj = {
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
    const body = await resp.json();

    if (body.status === 1) {
      return { success: true, postId: body.data?.tid || 'unknown', postUrl: '' };
    }

    // Rate limit retry (max 2 retries, 32s sleep — matches GAS)
    if (String(body.message).includes('發帖過於頻繁') && retryCount < 2) {
      logger.info({ retryCount }, 'Rate limited by BK, waiting 32s before retry');
      await new Promise((resolve) => setTimeout(resolve, 32000));
      return postNewThread(baseUrl, token, feed, content, typeid, bkApp, bkVer, retryCount + 1);
    }

    return { success: false, error: body.message || 'Post failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- Post reply (matches GAS _postReply with retry) ---

async function postReply(baseUrl, token, feed, content, bkApp, bkVer, retryCount = 0) {
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
    const body = await resp.json();

    if (body.status === 1) {
      return { success: true, postId: body.data?.pid || 'unknown', postUrl: '' };
    }

    // Rate limit retry (max 2 retries, 32s sleep)
    if (String(body.message).includes('發帖過於頻繁') && retryCount < 2) {
      logger.info({ retryCount }, 'Rate limited by BK, waiting 32s before retry');
      await new Promise((resolve) => setTimeout(resolve, 32000));
      return postReply(baseUrl, token, feed, content, bkApp, bkVer, retryCount + 1);
    }

    return { success: false, error: body.message || 'Reply failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- Rate limiting (matches GAS _enforceRateLimit) ---

async function enforceRateLimit(persona, rateLimitSec) {
  if (!persona.cooldownUntil || persona.cooldownUntil <= new Date()) return;

  const waitMs = persona.cooldownUntil.getTime() - Date.now();
  if (waitMs <= 0) return;

  logger.info({ personaId: persona.accountId, waitMs: Math.ceil(waitMs / 1000) + 's' }, 'Rate limit cooldown');
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

// --- Forum index sync (matches GAS fetchAndStoreForumIndex) ---

export async function syncForumIndex() {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return { success: false, error: 'BK_BASE_URL not configured' };

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  const params = new URLSearchParams({ mod: 'forum', op: 'index', app: bkApp, ver: bkVer });

  try {
    const resp = await fetch(`${baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.json();

    if (body.status !== 1) return { success: false, error: body.message };

    const groups = body.data?.lists || [];
    const forums = [];

    for (const group of groups) {
      const subforums = group.subforums || [];
      for (const sf of subforums) {
        forums.push({
          categoryName: group.name || '',
          name: sf.name || '',
          fid: parseInt(sf.fid, 10),
          threads: parseInt(sf.threads || '0', 10),
        });
      }
    }

    return { success: true, forums, count: forums.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- BK Forum read APIs (for Scanner) ---

export async function fetchThreadList(fid) {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return mockThreadList();

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  // Use any cached token for read access
  const cachedToken = Object.values(_bkTokens)[0] || '';

  const paramObj = {
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
    const body = await resp.json();

    if (body.status !== 1) return [];

    // BK API returns threads under different keys
    const threads = body.data?.lists || body.data?.threads || body.data?.list || body.data?.threadlist || [];

    return threads.map((t) => ({
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

export async function fetchThreadContent(tid) {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return 'Mock thread content for testing.';

  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';
  const cachedToken = Object.values(_bkTokens)[0] || '';

  const paramObj = {
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
    const body = await resp.json();

    if (body.status !== 1) return null;

    const posts = body.data?.posts || body.data?.list || body.data?.postlist || body.data?.lists || [];
    if (!posts.length) return null;

    // Take OP + first 3 replies, strip HTML
    return posts.slice(0, 4)
      .map((p) => stripHtml(p.message || ''))
      .join('\n\n');
  } catch (err) {
    logger.warn({ err, tid }, 'Failed to fetch thread content');
    return null;
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function mockThreadList() {
  return [
    { tid: 23900001, subject: '幼稚園面試心得分享', replies: 15, author: 'test', lastpost: '' },
    { tid: 23900002, subject: '母乳餵哺遇到困難', replies: 8, author: 'test', lastpost: '' },
    { tid: 23900003, subject: '湊仔經好攰但好值得', replies: 25, author: 'test', lastpost: '' },
  ];
}

async function mockPost(feed, persona, userId, ip) {
  logger.info({ feedId: feed.feedId }, 'Mock posting feed (BK_BASE_URL not configured)');
  feed.status = 'posted';
  feed.postedAt = new Date();
  feed.postId = `mock-${Date.now()}`;
  await feed.save();

  persona.postsToday = (persona.postsToday || 0) + 1;
  persona.lastPostAt = new Date();
  await persona.save();

  await auditService.log({
    operator: userId || 'system', eventType: 'FEED_POSTED', module: 'poster',
    feedId: feed.feedId, bkUsername: persona.username, ip,
    actionDetail: `Posted feed ${feed.feedId} (mock)`, session: userId ? 'admin' : 'worker',
  });

  return feed;
}

// --- Poster history ---

export async function getHistory({ page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const filter = { status: { $in: ['posted', 'failed'] } };
  const [data, total] = await Promise.all([
    Feed.find(filter).sort('-postedAt').skip(skip).limit(limit)
      .select('feedId threadSubject personaId bkUsername status postedAt failReason postId'),
    Feed.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
