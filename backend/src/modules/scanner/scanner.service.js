import Feed from '../feed/feed.model.js';
import Persona from '../persona/persona.model.js';
import { ForumBoard } from '../forum/forum.model.js';
import * as configService from '../config/config.service.js';
import { callGemini } from '../gemini/gemini.service.js';
import { buildPrompt, autoAssignTier } from '../gemini/prompt.builder.js';
import { matchGoogleTrends } from '../gemini/google-trends.service.js';
import { checkQuality, checkSimilarity } from '../gemini/quality-guard.js';
import { fetchThreadList, fetchThreadContent } from '../poster/poster.service.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

/**
 * Scan forum threads and generate reply suggestions.
 * Implements 7-layer filtering + 2 circuit breakers.
 */
export async function scanForumThreads() {
  const startTime = Date.now();
  const timeoutMinutes = parseInt(await configService.getValue('SCANNER_TIMEOUT_MINUTES') || '5', 10);
  const maxQueue = parseInt(await configService.getValue('MAX_PENDING_QUEUE') || '100', 10);
  const relevanceThreshold = parseInt(await configService.getValue('SCANNER_RELEVANCE_THRESHOLD') || '35', 10);

  const stats = { scanned: 0, hits: 0, feeds: 0, skipped: { queueFull: 0, replyCount: 0, duplicate: 0, fetchFail: 0, lowRelevance: 0, notWorth: 0, noPersona: 0 } };

  // Layer 1: Queue capacity check
  const pendingCount = await Feed.countDocuments({ status: 'pending' });
  if (pendingCount >= maxQueue) {
    logger.info({ pendingCount, maxQueue }, 'Scanner skipped: queue full');
    stats.skipped.queueFull = 1;
    return stats;
  }

  // Get active boards with scraping enabled
  const boards = await ForumBoard.find({ isActive: true, enableScraping: true })
    .populate('personaBindings.personaId');

  let added = 0;

  for (const board of boards) {
    // Circuit breaker: timeout
    if (Date.now() - startTime > timeoutMinutes * 60 * 1000) {
      logger.info('Scanner timeout, exiting');
      break;
    }

    // Circuit breaker: queue full during scan
    if (pendingCount + added >= maxQueue) {
      logger.info('Scanner queue full during scan, stopping');
      break;
    }

    const threads = await fetchThreadList(board.fid);
    stats.scanned += threads.length;

    for (const thread of threads) {
      // Circuit breakers again
      if (Date.now() - startTime > timeoutMinutes * 60 * 1000) break;
      if (pendingCount + added >= maxQueue) break;

      // Layer 2: Reply count filter
      if (thread.replies < board.replyThreshold.min || thread.replies > board.replyThreshold.max) {
        stats.skipped.replyCount++;
        continue;
      }

      // Layer 3: Duplicate check
      const exists = await Feed.findOne({ threadTid: thread.tid, source: 'scanner' });
      if (exists) {
        stats.skipped.duplicate++;
        continue;
      }

      // Layer 4: Fetch content
      const content = await fetchThreadContent(thread.tid);
      if (!content) {
        stats.skipped.fetchFail++;
        continue;
      }

      // Step 1: Evaluate (low token cost)
      const evaluation = await evaluateThread(thread.subject, content);

      // Layer 5: Relevance score
      if (evaluation.relevanceScore < relevanceThreshold) {
        stats.skipped.lowRelevance++;
        continue;
      }

      // Layer 6: Worth replying
      if (!evaluation.worthReplying) {
        stats.skipped.notWorth++;
        continue;
      }

      // Layer 7: Select persona
      const persona = await selectPersona(board, evaluation.topic);
      if (!persona) {
        stats.skipped.noPersona++;
        continue;
      }

      stats.hits++;

      // Step 2: Generate reply (full prompt)
      const tier = evaluation.tier ? parseTier(evaluation.tier) : autoAssignTier(thread.subject);
      const googleTrends = await matchGoogleTrends(thread.subject);

      const promptResult = await buildPrompt({
        persona: persona.accountId,
        toneMode: evaluation.toneMode,
        topic: thread.subject,
        summary: content.substring(0, 200),
        sentimentScore: evaluation.sentimentScore,
        sensitivityTier: tier,
        googleTrends,
      });

      const genResult = await callGemini(promptResult.systemPrompt, promptResult.userPrompt);
      const replyText = typeof genResult.text === 'string' ? genResult.text : genResult.text.replyText || '';

      // Quality check
      const quality = checkQuality(replyText, persona);

      // Check similarity with recent feeds from same persona
      const recentFeeds = await Feed.find({
        personaId: persona.accountId,
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }).select('draftContent');
      const similarity = checkSimilarity(replyText, recentFeeds.map(f => f.draftContent).filter(Boolean));

      // Save feed
      const feedId = generateFeedId();
      await Feed.create({
        feedId,
        type: 'reply',
        status: 'pending',
        source: 'scanner',
        threadTid: thread.tid,
        threadFid: board.fid,
        threadSubject: thread.subject,
        threadContent: content.substring(0, 500),
        trendSource: 'SCAN',
        personaId: persona.accountId,
        bkUsername: persona.username,
        archetype: persona.archetype,
        toneMode: promptResult.resolvedToneMode,
        sensitivityTier: `Tier ${tier}`,
        postType: 'reply',
        draftContent: replyText,
        charCount: replyText.length,
        relevanceScore: evaluation.relevanceScore,
        worthReplying: evaluation.worthReplying,
        googleTrends: googleTrends || undefined,
        qualityWarnings: [...quality.warnings, ...(similarity.isDuplicate ? ['Possible duplicate content'] : [])],
        isDuplicate: similarity.isDuplicate,
      });

      stats.feeds++;
      added++;
    }
  }

  await auditService.log({
    operator: 'system',
    eventType: 'SCAN_COMPLETE',
    module: 'scanner',
    actionDetail: `Scanned ${stats.scanned}, hits ${stats.hits}, feeds ${stats.feeds}`,
    after: stats,
    session: 'worker',
  });

  return stats;
}

// --- BK Forum API calls imported from poster.service.js ---
// fetchThreadList, fetchThreadContent are imported at top

async function evaluateThread(subject, content) {
  const systemPrompt = '你係一個香港親子論壇內容分析師。評估以下帖子是否值得用親子角色回覆。以JSON格式回覆。';
  const userPrompt = `帖子標題：${subject}\n內容：${content.substring(0, 500)}\n\n請評估並回覆JSON: { relevanceScore (0-100), worthReplying (boolean), topic (string), tier (string), toneMode (string), sentimentScore (0-100), reasoning (string) }`;

  const result = await callGemini(systemPrompt, userPrompt, { json: true });
  return result.text;
}

async function selectPersona(board, topic) {
  // Get personas from board bindings, or fallback to all active personas
  let candidates = [];

  if (board.personaBindings?.length) {
    candidates = board.personaBindings
      .filter((b) => b.personaId?.isActive && b.personaId?.postsToday < b.personaId?.maxPostsPerDay)
      .map((b) => b.personaId);
  }

  if (candidates.length === 0) {
    candidates = await Persona.find({
      isActive: true,
      $expr: { $lt: ['$postsToday', '$maxPostsPerDay'] },
    });
  }

  // Filter by topic blacklist
  if (topic) {
    const topicLower = topic.toLowerCase();
    candidates = candidates.filter((p) =>
      !(p.topicBlacklist || []).some((bl) => topicLower.includes(bl.toLowerCase()))
    );
  }

  if (candidates.length === 0) return null;

  // Random selection (weighted selection can be added later)
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function parseTier(tierString) {
  if (!tierString) return 1;
  const match = tierString.match(/(\d)/);
  return match ? parseInt(match[1], 10) : 1;
}

function generateFeedId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `FQ-${ts}-${rand}`;
}

export async function getHistory({ page = 1, limit = 20 }) {
  // Return scan-sourced feeds as history
  const skip = (page - 1) * limit;
  const filter = { source: 'scanner' };
  const [data, total] = await Promise.all([
    Feed.find(filter).sort('-createdAt').skip(skip).limit(limit).select('feedId threadSubject threadFid personaId toneMode status relevanceScore createdAt'),
    Feed.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
