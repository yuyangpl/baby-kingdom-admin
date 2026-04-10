import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../../shared/database.js';
import { fetchGoogleTrends, analyzeTrendsWithGemini } from '../gemini/google-trends.service.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';
import crypto from 'crypto';

/**
 * Pull Google Trends from API, analyze with Gemini, store in DB.
 * Called by worker cron every 30 minutes.
 */
export async function pullAndStore(): Promise<{ pullId: string; count: number }> {
  const prisma = getPrisma();
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

  // 3. Clear old data and store new (delete children first due to FK)
  await prisma.googleTrendNews.deleteMany({});
  await prisma.googleTrend.deleteMany({});
  const now = new Date();
  let saved = 0;
  for (const t of trends) {
    const geminiAnalysis = analyzedMap.get(t.query) || null;
    try {
      const trend = await prisma.googleTrend.upsert({
        where: { query: t.query },
        create: {
          query: t.query,
          score: t.score,
          peakVolume: t.peakVolume,
          durationHours: t.durationHours,
          categories: t.categories,
          trendBreakdown: t.trendBreakdown,
          analysis: geminiAnalysis
            ? {
                summary: geminiAnalysis.summary,
                parentingRelevance: geminiAnalysis.parentingRelevance,
                suggestedAngle: geminiAnalysis.suggestedAngle,
                safeToMention: geminiAnalysis.safeToMention,
              }
            : Prisma.DbNull,
          pullId,
          pulledAt: now,
        },
        update: {
          score: t.score,
          peakVolume: t.peakVolume,
          durationHours: t.durationHours,
          categories: t.categories,
          trendBreakdown: t.trendBreakdown,
          analysis: geminiAnalysis
            ? {
                summary: geminiAnalysis.summary,
                parentingRelevance: geminiAnalysis.parentingRelevance,
                suggestedAngle: geminiAnalysis.suggestedAngle,
                safeToMention: geminiAnalysis.safeToMention,
              }
            : Prisma.DbNull,
          pullId,
          pulledAt: now,
        },
      });

      // Delete old news for this trend, then create new
      await prisma.googleTrendNews.deleteMany({ where: { trendId: trend.id } });
      for (const n of t.news) {
        await prisma.googleTrendNews.create({
          data: { trendId: trend.id, headline: n.headline, url: n.url },
        });
      }

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
  const prisma = getPrisma();
  const where: any = {};

  if (relevance && relevance !== 'all') {
    where.analysis = { path: ['parentingRelevance'], equals: relevance };
  }
  if (safeOnly === 'true') {
    where.analysis = { ...(where.analysis || {}), path: ['safeToMention'], equals: true };
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.googleTrend.findMany({
      where,
      orderBy: [{ pulledAt: 'desc' }, { score: 'desc' }],
      skip,
      take: limit,
      include: { news: true },
    }),
    prisma.googleTrend.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Get the latest pull's trends (for matching by scanner).
 */
export async function getLatestTrends() {
  const prisma = getPrisma();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.googleTrend.findMany({
    where: { pulledAt: { gte: oneHourAgo } },
    orderBy: { score: 'desc' },
    include: { news: true },
  });
}
