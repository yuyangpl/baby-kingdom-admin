import { getPrisma } from '../../shared/database.js';
import { callGemini } from '../gemini/gemini.service.js';
import { buildPrompt, autoAssignTier } from '../gemini/prompt.builder.js';
import { checkQuality } from '../gemini/quality-guard.js';
import * as configService from '../config/config.service.js';
import { NotFoundError, BusinessError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';
import xss from 'xss';


/** Find feed by UUID id or custom feedId field */
async function findFeed(id: string) {
  const prisma = getPrisma();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    const feed = await prisma.feed.findUnique({ where: { id } });
    if (feed) return feed;
  }
  return prisma.feed.findUnique({ where: { feedId: id } });
}

interface FeedListParams {
  status?: string;
  source?: string;
  threadFid?: string | number;
  personaId?: string;
  claimedBy?: string;
  reviewedBy?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export async function list({ status, source, threadFid, personaId, claimedBy, reviewedBy, page = 1, limit = 20, sort = '-createdAt' }: FeedListParams) {
  const prisma = getPrisma();
  const where: Record<string, any> = {};
  if (status) where.status = status;
  if (source) where.source = { has: source };
  if (threadFid) where.threadFid = parseInt(String(threadFid), 10);
  if (personaId) where.personaId = personaId;
  if (claimedBy) where.claimedBy = claimedBy;
  if (reviewedBy) where.reviewedBy = reviewedBy;

  limit = Math.min(parseInt(String(limit)) || 20, 200);
  const skip = (page - 1) * limit;

  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const orderBy = { [field]: desc ? 'desc' as const : 'asc' as const };

  const [data, total] = await Promise.all([
    prisma.feed.findMany({ where, orderBy, skip, take: limit }),
    prisma.feed.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getById(id: string) {
  const prisma = getPrisma();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let feed;
  if (uuidRegex.test(id)) {
    feed = await prisma.feed.findUnique({ where: { id } });
  }
  if (!feed) {
    feed = await prisma.feed.findUnique({ where: { feedId: id } });
  }
  if (!feed) throw new NotFoundError('Feed');
  return feed;
}

// --- Approve / Reject ---
export async function approve(feedId: string, userId: string, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (!['pending', 'failed'].includes(feed.status)) throw new BusinessError('Can only approve pending or failed feeds');

  const prisma = getPrisma();
  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'approved',
      reviewedBy: userId,
      reviewedAt: new Date(),
      failReason: null,
      claimedBy: null,
      claimedAt: null,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_APPROVED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Approved feed ${feed.feedId}`,
  });

  // Dispatch to poster task endpoint
  const port = process.env.PORT || 8080;
  fetch(`http://localhost:${port}/tasks/poster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId: feed.id, triggeredBy: 'approve' }),
    signal: AbortSignal.timeout(30000),
  }).catch(err => logger.warn({ err }, 'Poster task dispatch failed'));

  return updated;
}

export async function revertToPending(feedId: string, userId: string, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'rejected') throw new BusinessError('Can only revert rejected feeds');

  const prisma = getPrisma();
  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: null,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_REVERTED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Reverted feed ${feed.feedId} to pending`,
  });

  return updated;
}

export async function reject(feedId: string, userId: string, notes: string | undefined, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (!['pending', 'approved'].includes(feed.status)) throw new BusinessError('Can only reject pending or approved feeds');

  const prisma = getPrisma();
  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'rejected',
      reviewedBy: userId,
      reviewedAt: new Date(),
      adminNotes: notes || '',
      claimedBy: null,
      claimedAt: null,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_REJECTED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Rejected feed ${feed.feedId}: ${notes || ''}`,
  });

  return updated;
}

// --- Edit content ---
export async function updateContent(feedId: string, updates: { content: string; toneMode?: string; personaId?: string; adminNotes?: string }, userId: string, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');

  const prisma = getPrisma();
  const cleanContent = xss(updates.content);
  const data: Record<string, any> = {
    finalContent: cleanContent,
    adminEdit: true,
    charCount: cleanContent.length,
  };
  if (updates.toneMode) data.toneMode = updates.toneMode;
  if (updates.personaId) {
    const persona = await prisma.persona.findFirst({ where: { accountId: updates.personaId } });
    if (persona) {
      data.personaId = persona.accountId;
      data.bkUsername = persona.username;
      data.archetype = persona.archetype;
    }
  }
  if (updates.adminNotes !== undefined) data.adminNotes = updates.adminNotes;

  const updated = await prisma.feed.update({ where: { id: feed.id }, data });

  await auditService.log({
    operator: userId, eventType: 'FEED_EDITED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Content edited by admin${updates.toneMode ? `, tone: ${updates.toneMode}` : ''}${updates.personaId ? `, persona: ${updates.personaId}` : ''}`,
  });

  return updated;
}

// --- Regenerate ---
export async function regenerate(feedId: string, { toneMode, personaAccountId }: { toneMode?: string; personaAccountId?: string } = {}, userId: string, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');

  const prisma = getPrisma();
  const personaAcct = personaAccountId || feed.personaId;
  const tone = toneMode || feed.toneMode;
  const tier = feed.sensitivityTier ? parseInt(feed.sensitivityTier.match(/\d/)?.[0] || '1', 10) : 1;

  const promptResult = await buildPrompt({
    persona: personaAcct!,
    toneMode: tone ?? undefined,
    topic: feed.threadSubject ?? undefined,
    summary: feed.threadContent?.substring(0, 200),
    sensitivityTier: tier,
  });

  const result = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
  const newContent = typeof result.text === 'string' ? result.text : result.text.replyText || '';

  const data: Record<string, any> = {
    draftContent: newContent,
    finalContent: null,
    adminEdit: false,
    charCount: newContent.length,
    toneMode: promptResult.resolvedToneMode,
  };

  if (personaAccountId) {
    const personaDoc = await prisma.persona.findFirst({ where: { accountId: personaAccountId } });
    if (personaDoc) {
      data.personaId = personaDoc.accountId;
      data.bkUsername = personaDoc.username;
      data.archetype = personaDoc.archetype;
    }
  }

  const updated = await prisma.feed.update({ where: { id: feed.id }, data });

  await auditService.log({
    operator: userId, eventType: 'FEED_GENERATED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Regenerated with tone=${promptResult.resolvedToneMode}, persona=${personaAcct}`,
  });

  return updated;
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
  const prisma = getPrisma();
  const persona = personaAccountId
    ? await prisma.persona.findFirst({ where: { accountId: personaAccountId } })
    : await prisma.persona.findFirst({ where: { isActive: true } });

  if (!persona) throw new BusinessError('No available persona');

  const tier = autoAssignTier(topic);

  const promptResult = await buildPrompt({
    persona: persona.accountId,
    toneMode,
    topic,
    sensitivityTier: tier,
    postType: postType || 'new-post',
  });

  const result = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
  const rawContent = typeof result.text === 'string' ? result.text : result.text.replyText || '';

  let subject = '';
  let draftContent: string;
  if (postType === 'new-post') {
    const subjectMatch = rawContent.match(/標題[：:]\s*(.+)/);
    const contentMatch = rawContent.match(/正文[：:]\s*([\s\S]+)/);
    if (subjectMatch && contentMatch) {
      subject = xss(subjectMatch[1].trim()).substring(0, 80);
      draftContent = xss(contentMatch[1].trim());
    } else {
      subject = topic.substring(0, 40);
      draftContent = xss(rawContent);
    }
  } else {
    draftContent = xss(rawContent);
  }

  const quality = checkQuality(draftContent, persona);

  const feedIdStr = generateFeedId();
  const feed = await prisma.feed.create({
    data: {
      feedId: feedIdStr,
      type: postType === 'new-post' ? 'thread' : 'reply',
      status: 'pending',
      source: ['custom'],
      subject,
      threadSubject: subject || topic,
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
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_GENERATED', module: 'feed',
    feedId: feedIdStr, ip, actionDetail: `Custom generated: ${topic}`,
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

// --- Trend → Feed Generation ---

async function selectPersonaForTrend(topicLabel: string, rule: any) {
  const prisma = getPrisma();
  const allPersonas = await prisma.persona.findMany({ where: { isActive: true } });

  const available = allPersonas.filter((p) => {
    if ((p.postsToday ?? 0) >= (p.maxPostsPerDay ?? 3)) return false;
    if (p.topicBlacklist?.some((bl: string) =>
      bl && topicLabel.toLowerCase().includes(bl.toLowerCase())
    )) return false;
    return true;
  });

  if (available.length === 0) return null;

  if (rule?.priorityAccountIds?.length) {
    for (const accountId of rule.priorityAccountIds) {
      const match = available.find((p) => p.accountId === accountId.trim());
      if (match) return match;
    }
  }

  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled[0];
}

export async function generateFromTrend(trend: any): Promise<{ feedId: string; toneMode: string } | null> {
  try {
    const prisma = getPrisma();
    const tier = trend.sensitivityTier ?? autoAssignTier(trend.topicLabel);
    const { matchTopicRule } = await import('../gemini/prompt.builder.js');
    const rule = await matchTopicRule(trend.topicLabel);

    const persona = await selectPersonaForTrend(trend.topicLabel, rule);
    if (!persona) {
      logger.info({ topic: trend.topicLabel }, 'generateFromTrend: no eligible persona');
      return null;
    }

    const postType = 'new-post' as const;
    const defaultFid = parseInt(await configService.getValue('DEFAULT_TREND_FID') || '162', 10);

    const promptResult = await buildPrompt({
      persona: persona.accountId,
      topic: trend.topicLabel,
      summary: trend.summary || '',
      sentimentScore: trend.sentimentScore ?? 50,
      sensitivityTier: tier,
      postType,
    });

    const result = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
    const rawContent = typeof result.text === 'string' ? result.text : result.text.replyText || '';
    if (!rawContent) return null;

    let subject = '';
    let draftContent: string;
    const subjectMatch = rawContent.match(/標題[：:]\s*(.+)/);
    const contentMatch = rawContent.match(/正文[：:]\s*([\s\S]+)/);
    if (subjectMatch && contentMatch) {
      subject = xss(subjectMatch[1].trim()).substring(0, 80);
      draftContent = xss(contentMatch[1].trim());
    } else {
      subject = trend.topicLabel.substring(0, 40);
      draftContent = xss(rawContent);
    }
    if (!draftContent) return null;

    const quality = checkQuality(draftContent, persona);

    const feedId = generateFeedId();
    await prisma.feed.create({
      data: {
        feedId,
        type: 'thread',
        status: 'pending',
        source: ['trends'],
        threadFid: defaultFid,
        trendSource: trend.source,
        trendTopic: trend.topicLabel,
        trendSummary: trend.summary || '',
        trendSentiment: trend.sentimentScore,
        trendEngagement: trend.engagements,
        pullTime: trend.createdAt || new Date(),
        personaId: persona.accountId,
        bkUsername: persona.username,
        archetype: persona.archetype,
        toneMode: promptResult.resolvedToneMode,
        sensitivityTier: `Tier ${tier}`,
        postType,
        subject,
        threadSubject: subject,
        draftContent,
        charCount: draftContent.length,
        qualityWarnings: quality.warnings,
      },
    });

    await auditService.log({
      operator: 'system',
      eventType: 'FEED_GENERATED',
      module: 'feed',
      feedId,
      actionDetail: `Trend → Feed | Tone: ${promptResult.resolvedToneMode} | Tier: ${tier} | Topic: "${trend.topicLabel}"`,
      session: 'worker',
    });

    logger.info({ feedId, persona: persona.accountId, topic: trend.topicLabel }, 'generateFromTrend: feed created');
    return { feedId, toneMode: promptResult.resolvedToneMode };
  } catch (err) {
    logger.error({ err, topic: trend.topicLabel }, 'generateFromTrend failed');
    await auditService.log({
      operator: 'system',
      eventType: 'FEED_GEN_ERROR',
      module: 'feed',
      actionDetail: `Trend: "${trend.topicLabel}" — ${(err as Error).message}`,
      session: 'worker',
    });
    return null;
  }
}
