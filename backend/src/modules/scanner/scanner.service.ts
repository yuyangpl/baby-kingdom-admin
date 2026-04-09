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

interface ScanStats {
  boardFid: number;
  boardName: string;
  status: 'completed' | 'interrupted' | 'skipped';
  scanned: number;
  hits: number;
  feeds: number;
  skipped: {
    queueFull: number;
    replyCount: number;
    duplicate: number;
    fetchFail: number;
    lowRelevance: number;
    notWorth: number;
    noPersona: number;
  };
}

interface ThreadItem {
  tid: number;
  subject: string;
  replies: number;
  author: string;
  lastpost: string;
}

interface EvaluationResult {
  relevanceScore: number;
  worthReplying: boolean;
  topic: string;
  tier?: string;
  toneMode?: string;
  sentimentScore?: number;
  reasoning?: string;
}

/**
 * Scan forum threads and generate reply suggestions.
 * Implements 7-layer filtering + 2 circuit breakers.
 */
/**
 * Get boards that are due for scanning (enabled + interval elapsed).
 */
export async function getBoardsDueForScan(): Promise<{ fid: number; name: string }[]> {
  const boards = await ForumBoard.find({ isActive: true, enableScraping: true }).select('fid name scanInterval lastScannedAt');
  const now = Date.now();
  return boards.filter(b => {
    const intervalMs = (b.scanInterval || 30) * 60 * 1000;
    const lastScan = b.lastScannedAt ? new Date(b.lastScannedAt).getTime() : 0;
    return (now - lastScan) >= intervalMs;
  }).map(b => ({ fid: b.fid, name: b.name }));
}

/**
 * Get all active boards with scraping enabled (for manual trigger).
 */
export async function getActiveBoards(): Promise<{ fid: number; name: string }[]> {
  const boards = await ForumBoard.find({ isActive: true, enableScraping: true }).select('fid name');
  return boards.map(b => ({ fid: b.fid, name: b.name }));
}

/**
 * Scan a single board for low-reply threads.
 * Timeout causes graceful interruption — already scanned data is kept.
 */
export async function scanBoard(fid: number): Promise<ScanStats> {
  const startTime = Date.now();
  const timeoutMinutes = parseInt(await configService.getValue('SCANNER_TIMEOUT_MINUTES') || '5', 10);
  const maxQueue = parseInt(await configService.getValue('MAX_PENDING_QUEUE') || '100', 10);
  const relevanceThreshold = parseInt(await configService.getValue('SCANNER_RELEVANCE_THRESHOLD') || '35', 10);

  const board = await ForumBoard.findOne({ fid, isActive: true, enableScraping: true })
    .populate('personaBindings.personaId');

  const stats: ScanStats = {
    boardFid: fid,
    boardName: board?.name || `fid:${fid}`,
    status: 'completed',
    scanned: 0, hits: 0, feeds: 0,
    skipped: { queueFull: 0, replyCount: 0, duplicate: 0, fetchFail: 0, lowRelevance: 0, notWorth: 0, noPersona: 0 },
  };

  if (!board) {
    logger.warn({ fid }, 'scanBoard: board not found or not active');
    stats.status = 'skipped';
    return stats;
  }

  // Layer 1: Queue capacity check
  const pendingCount = await Feed.countDocuments({ status: 'pending' });
  if (pendingCount >= maxQueue) {
    logger.info({ pendingCount, maxQueue, fid }, 'scanBoard skipped: queue full');
    stats.skipped.queueFull = 1;
    stats.status = 'skipped';
    return stats;
  }

  const threads = await fetchThreadList(board.fid);
  stats.scanned = threads.length;
  let added = 0;

  for (const thread of threads) {
    // Circuit breaker: timeout → mark interrupted
    if (Date.now() - startTime > timeoutMinutes * 60 * 1000) {
      logger.info({ fid, scanned: stats.scanned, feeds: stats.feeds }, 'scanBoard timeout, interrupting');
      stats.status = 'interrupted';
      break;
    }

    // Circuit breaker: queue full
    if (pendingCount + added >= maxQueue) {
      logger.info({ fid }, 'scanBoard queue full, stopping');
      stats.status = 'interrupted';
      break;
    }

    // Layer 2: Reply count filter
    if (thread.replies < board.replyThreshold.min || thread.replies > board.replyThreshold.max) {
      stats.skipped.replyCount++;
      continue;
    }

    // Layer 3: Duplicate check
    const exists = await Feed.findOne({ threadTid: thread.tid, source: { $in: ['scanner'] } });
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
    let evaluation: EvaluationResult;
    try {
      evaluation = await evaluateThread(thread.subject, content);
    } catch (err) {
      logger.warn({ err, tid: thread.tid }, 'evaluateThread failed, skipping');
      stats.skipped.fetchFail++;
      continue;
    }

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

    // Validate toneMode from Gemini, fallback to auto (let buildPrompt resolve from persona)
    const validTones = ['INFO_SHARE', 'SHARE_EXP', 'EMPATHISE', 'ASK_ENGAGE', 'CASUAL'];
    const evalToneMode = evaluation.toneMode && validTones.includes(evaluation.toneMode) ? evaluation.toneMode : '';

    const promptResult = await buildPrompt({
      persona: persona.accountId,
      toneMode: evalToneMode,
      topic: thread.subject,
      summary: content.substring(0, 200),
      sentimentScore: evaluation.sentimentScore,
      sensitivityTier: tier,
      googleTrends,
      defaultRuleIds: board.defaultRuleIds,
      excludeRuleIds: board.excludeRuleIds,
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
    const similarity = checkSimilarity(replyText, recentFeeds.map((f: any) => f.draftContent).filter(Boolean));

    // Save feed
    const feedId = generateFeedId();
    const feedSource: string[] = googleTrends ? ['scanner', 'trends'] : ['scanner'];
    await Feed.create({
      feedId,
      type: 'reply',
      status: 'pending',
      source: feedSource,
      threadTid: thread.tid,
      threadFid: board.fid,
      threadSubject: thread.subject,
      threadContent: content.substring(0, 500),
      trendSource: 'SCAN',
      trendTopic: thread.subject,
      trendSummary: `BK 論壇掃描 · tid:${thread.tid} · fid:${board.fid}`,
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

  await auditService.log({
    operator: 'system',
    eventType: stats.status === 'interrupted' ? 'SCAN_INTERRUPTED' : 'SCAN_COMPLETE',
    module: 'scanner',
    actionDetail: `Board fid:${fid} (${board.name}) — scanned ${stats.scanned}, hits ${stats.hits}, feeds ${stats.feeds}, status: ${stats.status}`,
    after: stats,
    session: 'worker',
  });

  // Update lastScannedAt so interval check works
  await ForumBoard.updateOne({ fid }, { $set: { lastScannedAt: new Date() } });

  return stats;
}

// --- BK Forum API calls imported from poster.service.js ---
// fetchThreadList, fetchThreadContent are imported at top

async function evaluateThread(subject: string, content: string): Promise<EvaluationResult> {
  const systemPrompt = '你係一個香港親子論壇內容分析師。評估以下帖子是否值得用親子角色回覆。以JSON格式回覆。';
  const userPrompt = `帖子標題：${subject}\n內容：${content.substring(0, 500)}\n\n請評估並回覆JSON: { relevanceScore (0-100), worthReplying (boolean), topic (string), tier (string "Tier 1 — Safe" / "Tier 2 — Moderate" / "Tier 3 — Sensitive"), toneMode (只能選: "INFO_SHARE" / "SHARE_EXP" / "EMPATHISE" / "ASK_ENGAGE" / "CASUAL"), sentimentScore (0-100), reasoning (string) }`;

  const result = await callGemini(systemPrompt, userPrompt, { json: true });
  return result.text;
}

async function selectPersona(board: any, topic: string) {
  // Get personas from board bindings, or fallback to all active personas
  let candidates: any[] = [];

  if (board.personaBindings?.length) {
    candidates = board.personaBindings
      .filter((b: any) => b.personaId?.isActive && b.personaId?.postsToday < b.personaId?.maxPostsPerDay)
      .map((b: any) => b.personaId);
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
    candidates = candidates.filter((p: any) =>
      !(p.topicBlacklist || []).some((bl: string) => topicLower.includes(bl.toLowerCase()))
    );
  }

  if (candidates.length === 0) return null;

  // Random selection (weighted selection can be added later)
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function parseTier(tierString: string): number {
  if (!tierString) return 1;
  const match = tierString.match(/(\d)/);
  return match ? parseInt(match[1], 10) : 1;
}

function generateFeedId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `FQ-${ts}-${rand}`;
}

export async function getHistory({ page = 1, limit = 20, from, to }: { page?: number; limit?: number; from?: string; to?: string }) {
  const skip = (page - 1) * limit;
  const filter: Record<string, any> = { source: { $in: ['scanner'] } };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [data, total] = await Promise.all([
    Feed.find(filter).sort('-createdAt').skip(skip).limit(limit).select('feedId threadTid threadFid threadSubject threadContent personaId toneMode status relevanceScore draftContent createdAt'),
    Feed.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
