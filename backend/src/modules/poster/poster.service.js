import Feed from '../feed/feed.model.js';
import Persona from '../persona/persona.model.js';
import * as configService from '../config/config.service.js';
import * as auditService from '../audit/audit.service.js';
import { NotFoundError, BusinessError } from '../../shared/errors.js';
import logger from '../../shared/logger.js';

/**
 * Post an approved feed to BK Forum.
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
    // Mock posting in dev
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

  try {
    // Rate limiting
    const rateLimitSec = parseInt(await configService.getValue('BK_RATE_LIMIT_SECONDS') || '35', 10);
    if (persona.cooldownUntil && persona.cooldownUntil > new Date()) {
      const waitMs = persona.cooldownUntil.getTime() - Date.now();
      logger.info({ personaId: persona.accountId, waitMs }, 'Rate limit cooldown, waiting');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // Login if needed
    const token = await ensureBkLogin(persona, baseUrl);

    // Post
    const result = feed.postType === 'new-post'
      ? await postNewThread(baseUrl, token, feed, content)
      : await postReply(baseUrl, token, feed, content);

    feed.status = 'posted';
    feed.postedAt = new Date();
    feed.postId = result.postId || '';
    feed.postUrl = result.postUrl || '';
    await feed.save();

    // Update persona
    persona.postsToday = (persona.postsToday || 0) + 1;
    persona.lastPostAt = new Date();
    persona.cooldownUntil = new Date(Date.now() + rateLimitSec * 1000);
    await persona.save();

    await auditService.log({
      operator: userId || 'system', eventType: 'FEED_POSTED', module: 'poster',
      feedId: feed.feedId, bkUsername: persona.username, ip,
      apiStatus: 200, actionDetail: `Posted feed ${feed.feedId}`,
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
      actionDetail: `Post failed: ${err.message}`, session: userId ? 'admin' : 'worker',
    });

    throw err;
  }
}

async function ensureBkLogin(persona, baseUrl) {
  if (persona.bkToken && persona.bkTokenExpiry > new Date()) {
    return persona.bkToken;
  }

  const password = persona.bkPassword; // should be decrypted
  const app = await configService.getValue('BK_APP') || 'android';
  const ver = await configService.getValue('BK_VER') || '3.11.11';

  const response = await fetch(`${baseUrl}?mod=member&op=login&app=${app}&ver=${ver}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${persona.username}&password=${password}`,
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();
  const token = data.token || data.auth;

  if (!token) throw new Error(`BK login failed for ${persona.username}`);

  persona.bkToken = token;
  persona.bkTokenExpiry = new Date(Date.now() + 24 * 3600 * 1000);
  persona.tokenStatus = 'active';
  await persona.save();

  return token;
}

async function postNewThread(baseUrl, token, feed, content) {
  const response = await fetch(`${baseUrl}?mod=forum&op=newthread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `auth=${token}&fid=${feed.threadFid}&subject=${encodeURIComponent(feed.subject || feed.threadSubject)}&message=${encodeURIComponent(content)}`,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return { postId: data.tid || '', postUrl: data.url || '' };
}

async function postReply(baseUrl, token, feed, content) {
  const response = await fetch(`${baseUrl}?mod=forum&op=newreply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `auth=${token}&tid=${feed.threadTid}&fid=${feed.threadFid}&message=${encodeURIComponent(content)}`,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return { postId: data.pid || '', postUrl: data.url || '' };
}

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
