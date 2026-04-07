import Feed from './feed.model.js';
import Persona from '../persona/persona.model.js';
import { ForumBoard } from '../forum/forum.model.js';
import { callGemini } from '../gemini/gemini.service.js';
import { buildPrompt, autoAssignTier } from '../gemini/prompt.builder.js';
import { checkQuality } from '../gemini/quality-guard.js';
import { NotFoundError, BusinessError, ConflictError } from '../../shared/errors.js';
import { emitToRoom } from '../../shared/socket.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';
import xss from 'xss';

const CLAIM_EXPIRY_MINUTES = 10;

interface FeedListParams {
  status?: string;
  source?: string;
  threadFid?: string | number;
  personaId?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export async function list({ status, source, threadFid, personaId, page = 1, limit = 20, sort = '-createdAt' }: FeedListParams) {
  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (threadFid) filter.threadFid = parseInt(String(threadFid), 10);
  if (personaId) filter.personaId = personaId;

  limit = Math.min(parseInt(String(limit)) || 20, 200);
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Feed.find(filter).sort(sort).skip(skip).limit(limit)
      .select('-threadContent'), // exclude large field from list
    Feed.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getById(id: string) {
  const feed = await Feed.findById(id);
  if (!feed) throw new NotFoundError('Feed');
  return feed;
}

// --- Claim ---
export async function claim(feedId: string, userId: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only claim pending feeds');

  // Check if already claimed by someone else (not expired)
  if (feed.claimedBy && feed.claimedBy.toString() !== userId) {
    const expiresAt = new Date(feed.claimedAt!.getTime() + CLAIM_EXPIRY_MINUTES * 60 * 1000);
    if (expiresAt > new Date()) {
      throw new ConflictError('Feed is claimed by another user');
    }
  }

  feed.claimedBy = userId as any;
  feed.claimedAt = new Date();
  await feed.save();
  emitToRoom('room:feed', 'feed:claimed', { feedId: feed._id, claimedBy: userId });
  return feed;
}

export async function unclaim(feedId: string, userId: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');

  if (feed.claimedBy?.toString() !== userId) {
    throw new BusinessError('You did not claim this feed');
  }

  feed.claimedBy = null;
  feed.claimedAt = null as any;
  await feed.save();
  emitToRoom('room:feed', 'feed:unclaimed', { feedId: feed._id });
  return feed;
}

// --- Approve / Reject ---
export async function approve(feedId: string, userId: string, ip: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only approve pending feeds');

  feed.status = 'approved';
  feed.reviewedBy = userId as any;
  feed.reviewedAt = new Date();
  feed.claimedBy = null;
  feed.claimedAt = null as any;
  await feed.save();

  await auditService.log({
    operator: userId, eventType: 'FEED_APPROVED', module: 'feed',
    feedId: feed.feedId, targetId: feed._id.toString(), ip,
    actionDetail: `Approved feed ${feed.feedId}`,
  });

  emitToRoom('room:feed', 'feed:statusChanged', { feedId: feed._id, status: 'approved' });

  // Auto-post: if the board has enableAutoReply, enqueue to poster queue
  if (feed.threadFid) {
    try {
      const board = await ForumBoard.findOne({ fid: feed.threadFid });
      if (board?.enableAutoReply) {
        const { getQueue } = await import('../queue/queue.service.js');
        const posterQueue = getQueue('poster');
        if (posterQueue) {
          await posterQueue.add('auto-post', {
            feedId: feed._id.toString(),
            triggeredBy: 'auto-approve',
          });
          logger.info({ feedId: feed.feedId, fid: feed.threadFid }, 'Auto-post queued after approval');
        }
      }
    } catch (err) {
      // Auto-post failure should not block approval
      logger.error({ err, feedId: feed.feedId }, 'Failed to queue auto-post');
    }
  }

  return feed;
}

export async function reject(feedId: string, userId: string, notes: string | undefined, ip: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only reject pending feeds');

  feed.status = 'rejected';
  feed.reviewedBy = userId as any;
  feed.reviewedAt = new Date();
  feed.adminNotes = notes || '';
  feed.claimedBy = null;
  feed.claimedAt = null as any;
  await feed.save();

  await auditService.log({
    operator: userId, eventType: 'FEED_REJECTED', module: 'feed',
    feedId: feed.feedId, targetId: feed._id.toString(), ip,
    actionDetail: `Rejected feed ${feed.feedId}: ${notes || ''}`,
  });

  emitToRoom('room:feed', 'feed:statusChanged', { feedId: feed._id, status: 'rejected' });
  return feed;
}

// --- Edit content ---
export async function updateContent(feedId: string, content: string, userId: string, ip: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');

  const cleanContent = xss(content);
  feed.finalContent = cleanContent;
  feed.adminEdit = true;
  feed.charCount = cleanContent.length;
  await feed.save();

  await auditService.log({
    operator: userId, eventType: 'FEED_GENERATED', module: 'feed',
    feedId: feed.feedId, targetId: feed._id.toString(), ip,
    actionDetail: 'Content edited by admin',
  });

  return feed;
}

// --- Regenerate ---
export async function regenerate(feedId: string, { toneMode, personaAccountId }: { toneMode?: string; personaAccountId?: string } = {}, userId: string, ip: string) {
  const feed = await Feed.findById(feedId);
  if (!feed) throw new NotFoundError('Feed');

  const persona = personaAccountId || feed.personaId;
  const tone = toneMode || feed.toneMode;

  const tier = feed.sensitivityTier ? parseInt(feed.sensitivityTier.match(/\d/)?.[0] || '1', 10) : 1;

  const promptResult = await buildPrompt({
    persona: persona!,
    toneMode: tone,
    topic: feed.threadSubject,
    summary: feed.threadContent?.substring(0, 200),
    sensitivityTier: tier,
  });

  const result = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
  const newContent = typeof result.text === 'string' ? result.text : result.text.replyText || '';

  feed.draftContent = newContent;
  feed.finalContent = null as any;
  feed.adminEdit = false;
  feed.charCount = newContent.length;
  feed.toneMode = promptResult.resolvedToneMode;
  if (personaAccountId) {
    const personaDoc = await Persona.findOne({ accountId: personaAccountId });
    if (personaDoc) {
      feed.personaId = personaDoc.accountId;
      feed.bkUsername = personaDoc.username;
      feed.archetype = personaDoc.archetype;
    }
  }
  await feed.save();

  await auditService.log({
    operator: userId, eventType: 'FEED_GENERATED', module: 'feed',
    feedId: feed.feedId, targetId: feed._id.toString(), ip,
    actionDetail: `Regenerated with tone=${promptResult.resolvedToneMode}, persona=${persona}`,
  });

  return feed;
}

// --- Custom Generate ---
interface CustomGenerateParams {
  topic: string;
  personaAccountId?: string;
  toneMode?: string;
  postType?: string;
  targetFid?: number;
}

export async function customGenerate({ topic, personaAccountId, toneMode, postType, targetFid }: CustomGenerateParams, userId: string, ip: string) {
  const persona = personaAccountId
    ? await Persona.findOne({ accountId: personaAccountId })
    : await Persona.findOne({ isActive: true });

  if (!persona) throw new BusinessError('No available persona');

  const tier = autoAssignTier(topic);

  const promptResult = await buildPrompt({
    persona: persona.accountId,
    toneMode,
    topic,
    sensitivityTier: tier,
  });

  const result = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
  const rawContent = typeof result.text === 'string' ? result.text : result.text.replyText || '';
  const draftContent = xss(rawContent);

  const quality = checkQuality(draftContent, persona);

  const feedId = generateFeedId();
  const feed = await Feed.create({
    feedId,
    type: postType === 'new-post' ? 'thread' : 'reply',
    status: 'pending',
    source: 'custom',
    trendSource: 'CUSTOM',
    threadSubject: topic,
    threadFid: targetFid,
    personaId: persona.accountId,
    bkUsername: persona.username,
    archetype: persona.archetype,
    toneMode: promptResult.resolvedToneMode,
    sensitivityTier: `Tier ${tier}`,
    postType: postType || 'reply',
    draftContent,
    charCount: draftContent.length,
    qualityWarnings: quality.warnings,
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_GENERATED', module: 'feed',
    feedId, ip, actionDetail: `Custom generated: ${topic}`,
  });

  return feed;
}

// --- Batch ---
export async function batchApprove(feedIds: string[], userId: string, ip: string) {
  const results: { succeeded: string[]; failed: { id: string; reason: string }[] } = { succeeded: [], failed: [] };
  for (const id of feedIds) {
    try {
      await approve(id, userId, ip);
      results.succeeded.push(id);
    } catch (err: any) {
      results.failed.push({ id, reason: err.message });
    }
  }
  return results;
}

export async function batchReject(feedIds: string[], userId: string, notes: string | undefined, ip: string) {
  const results: { succeeded: string[]; failed: { id: string; reason: string }[] } = { succeeded: [], failed: [] };
  for (const id of feedIds) {
    try {
      await reject(id, userId, notes, ip);
      results.succeeded.push(id);
    } catch (err: any) {
      results.failed.push({ id, reason: err.message });
    }
  }
  return results;
}

function generateFeedId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `FQ-${ts}-${rand}`;
}
