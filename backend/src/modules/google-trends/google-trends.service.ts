import GoogleTrend from './google-trends.model.js';
import { fetchGoogleTrends, analyzeTrendsWithGemini } from '../gemini/google-trends.service.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';
import crypto from 'crypto';

/**
 * Pull Google Trends from API, analyze with Gemini, store in DB.
 * Called by worker cron every 30 minutes.
 */
export async function pullAndStore(): Promise<{ pullId: string; count: number }> {
  const pullId = `GP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  // 1. Fetch from Google Trends API (Summary + Detail for news)
  const trends = await fetchGoogleTrends();
  if (trends.length === 0) {
    logger.info('google-trends pullAndStore: no trends returned from API');
    return { pullId, count: 0 };
  }

  // 2. Analyze with Gemini
  const analysis = await analyzeTrendsWithGemini(trends);
  const analyzedMap = new Map<string, { summary: string; parentingRelevance: string; suggestedAngle: string; safeToMention: boolean }>();
  if (analysis?.analyzedTrends) {
    for (const a of analysis.analyzedTrends) {
      analyzedMap.set(a.query, a);
    }
  }

  // 3. Clear old data and store new
  await GoogleTrend.deleteMany({});
  const now = new Date();
  let saved = 0;
  for (const t of trends) {
    const geminiAnalysis = analyzedMap.get(t.query) || null;
    try {
      await GoogleTrend.findOneAndUpdate(
        { query: t.query },
        {
          query: t.query,
          score: t.score,
          peakVolume: t.peakVolume,
          durationHours: t.durationHours,
          categories: t.categories,
          trendBreakdown: t.trendBreakdown,
          news: t.news,
          analysis: geminiAnalysis
            ? {
                summary: geminiAnalysis.summary,
                parentingRelevance: geminiAnalysis.parentingRelevance,
                suggestedAngle: geminiAnalysis.suggestedAngle,
                safeToMention: geminiAnalysis.safeToMention,
              }
            : null,
          pullId,
          pulledAt: now,
        },
        { upsert: true, new: true },
      );
      saved++;
    } catch (err) {
      logger.warn({ err, query: t.query }, 'google-trends: failed to save trend');
    }
  }

  try {
    await auditService.log({
      operator: 'system',
      eventType: 'GTRENDS_PULL_COMPLETE',
      module: 'google-trends',
      actionDetail: `Pulled ${saved} trends, pullId=${pullId}`,
    } as any);
  } catch {
    // audit logging is best-effort
  }

  logger.info({ pullId, count: saved }, 'google-trends pullAndStore complete');
  return { pullId, count: saved };
}

/**
 * List stored Google Trends with pagination.
 */
export async function list({
  page = 1,
  limit = 20,
  relevance,
  safeOnly,
}: {
  page?: number;
  limit?: number;
  relevance?: string;
  safeOnly?: string;
}) {
  const filter: Record<string, unknown> = {};

  if (relevance && relevance !== 'all') {
    filter['analysis.parentingRelevance'] = relevance;
  }
  if (safeOnly === 'true') {
    filter['analysis.safeToMention'] = true;
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    GoogleTrend.find(filter).sort({ pulledAt: -1, score: -1 }).skip(skip).limit(limit),
    GoogleTrend.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Get the latest pull's trends (for matching by scanner).
 */
export async function getLatestTrends() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return GoogleTrend.find({ pulledAt: { $gte: oneHourAgo } })
    .sort({ score: -1 })
    .lean();
}
