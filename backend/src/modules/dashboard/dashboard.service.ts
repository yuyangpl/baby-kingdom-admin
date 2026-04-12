import { getPrisma } from '../../shared/database.js';

export async function getRealtime() {
  const prisma = getPrisma();
  const pendingCount = await prisma.feed.count({ where: { status: 'pending' } });

  return { pendingFeeds: pendingCount };
}

export async function getToday() {
  const prisma = getPrisma();
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');
  const dayFilter = { createdAt: { gte: startOfDay, lte: endOfDay } };

  const totalScanned = 0, totalHit = 0;

  const [generated, approved, rejected, posted, failed, trendsPulled, trendsWithFeeds, threads, replies] = await Promise.all([
    prisma.feed.count({ where: dayFilter }),
    prisma.feed.count({ where: { status: 'approved', reviewedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'rejected', reviewedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'posted', postedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'failed', updatedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.trend.count({ where: dayFilter }),
    prisma.trend.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay }, NOT: { feedIds: { equals: [] } } } }),
    prisma.feed.count({ where: { ...dayFilter, type: 'thread' } }),
    prisma.feed.count({ where: { ...dayFilter, type: 'reply' } }),
  ]);

  const totalReviewed = approved + rejected;
  return {
    date: today,
    scanner: { totalScanned, totalHit, hitRate: totalScanned > 0 ? Math.round(totalHit / totalScanned * 100) / 100 : 0 },
    feeds: { generated, approved, rejected, posted, failed },
    trends: { pulled: trendsPulled, used: trendsWithFeeds },
    posts: { threads, replies },
    quality: { approvalRate: totalReviewed > 0 ? Math.round(approved / totalReviewed * 100) / 100 : 0 },
  };
}

export async function getRecent() {
  const prisma = getPrisma();
  const recentFeeds = await prisma.feed.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { feedId: true, status: true, source: true, threadSubject: true, personaId: true, updatedAt: true, postedAt: true },
  });

  return { feeds: recentFeeds };
}

export async function getWeekly() {
  const prisma = getPrisma();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  const stats = await prisma.dailyStats.findMany({
    where: { date: { gte: dateStr } },
    orderBy: { date: 'asc' },
  });
  return stats;
}

/**
 * Aggregate today's stats from raw data.
 * Called by Worker hourly via stats-aggregator queue.
 */
export async function aggregateDailyStats(): Promise<void> {
  const prisma = getPrisma();
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');

  const totalScanned = 0;
  const totalHit = 0;
  const hitRate = 0;

  const [
    generatedCount,
    approvedCount,
    rejectedCount,
    postedCount,
    failedCount,
    trendsPulled,
    trendsWithFeeds,
    duplicateCount,
    threadCount,
    replyCount,
  ] = await Promise.all([
    prisma.feed.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'approved', reviewedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'rejected', reviewedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'posted', postedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.feed.count({ where: { status: 'failed', updatedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.trend.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.trend.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay }, NOT: { feedIds: { equals: [] } } } }),
    prisma.feed.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay }, isDuplicate: true } }),
    prisma.feed.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay }, type: 'thread' } }),
    prisma.feed.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay }, type: 'reply' } }),
  ]);

  const totalReviewed = approvedCount + rejectedCount;
  const approvalRate = totalReviewed > 0 ? approvedCount / totalReviewed : 0;

  const data = {
    scanner: { totalScanned, totalHit: totalHit, hitRate: Math.round(hitRate * 100) / 100 },
    feeds: { generated: generatedCount, approved: approvedCount, rejected: rejectedCount, posted: postedCount, failed: failedCount },
    trends: { pulled: trendsPulled, used: trendsWithFeeds },
    posts: { threads: threadCount, replies: replyCount },
    quality: { approvalRate: Math.round(approvalRate * 100) / 100, duplicateCount },
  };

  await prisma.dailyStats.upsert({
    where: { date: today },
    create: { date: today, ...data },
    update: { ...data },
  });
}
