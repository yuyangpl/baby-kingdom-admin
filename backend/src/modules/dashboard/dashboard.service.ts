import Feed from '../feed/feed.model.js';
import Trend from '../trends/trends.model.js';
import DailyStats from './dashboard.model.js';
import * as queueService from '../queue/queue.service.js';

export async function getRealtime() {
  const [pendingCount, queueStatus] = await Promise.all([
    Feed.countDocuments({ status: 'pending' }),
    queueService.getAllStatus(),
  ]);

  return { pendingFeeds: pendingCount, queues: queueStatus };
}

export async function getToday() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');
  const dayFilter = { createdAt: { $gte: startOfDay, $lte: endOfDay } };

  const QueueJob = (await import('../queue/queue.model.js')).default;

  // Scanner stats from today's jobs
  const scannerJobs = await QueueJob.find({ queueName: 'scanner', ...dayFilter, status: 'completed' }).select('result');
  let totalScanned = 0, totalHit = 0;
  for (const job of scannerJobs) {
    const r = job.result as any;
    if (r) { totalScanned += r.scanned || 0; totalHit += r.hits || 0; }
  }

  const [generated, approved, rejected, posted, failed, trendsPulled, trendsWithFeeds, threads, replies] = await Promise.all([
    Feed.countDocuments(dayFilter),
    Feed.countDocuments({ status: 'approved', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'rejected', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'posted', postedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'failed', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Trend.countDocuments(dayFilter),
    Trend.countDocuments({ ...dayFilter, 'feedIds.0': { $exists: true } }),
    Feed.countDocuments({ ...dayFilter, type: 'thread' }),
    Feed.countDocuments({ ...dayFilter, type: 'reply' }),
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
  const [recentFeeds, recentJobs] = await Promise.all([
    Feed.find()
      .sort('-updatedAt')
      .limit(20)
      .select('feedId status source threadSubject personaId updatedAt postedAt'),
    (await import('../queue/queue.model.js')).default
      .find()
      .sort('-createdAt')
      .limit(10)
      .select('queueName status duration triggeredBy createdAt'),
  ]);

  return { feeds: recentFeeds, jobs: recentJobs };
}

export async function getWeekly() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

  const stats = await DailyStats.find({ date: { $gte: dateStr } }).sort('date');
  return stats;
}

/**
 * Aggregate today's stats from raw data.
 * Called by Worker hourly via stats-aggregator queue.
 */
export async function aggregateDailyStats(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');
  const dayFilter = { createdAt: { $gte: startOfDay, $lte: endOfDay } };

  const QueueJob = (await import('../queue/queue.model.js')).default;

  // Scanner stats from QueueJob records
  const scannerJobs = await QueueJob.find({
    queueName: 'scanner',
    ...dayFilter,
    status: 'completed',
  }).select('result');

  let totalScanned = 0;
  let totalHit = 0;
  for (const job of scannerJobs) {
    const r = job.result as any;
    if (r) {
      totalScanned += r.scanned || 0;
      totalHit += r.hits || 0;
    }
  }
  const hitRate = totalScanned > 0 ? totalHit / totalScanned : 0;

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
    Feed.countDocuments(dayFilter),
    Feed.countDocuments({ status: 'approved', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'rejected', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'posted', postedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'failed', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Trend.countDocuments(dayFilter),
    Trend.countDocuments({ ...dayFilter, 'feedIds.0': { $exists: true } }),
    Feed.countDocuments({ ...dayFilter, isDuplicate: true }),
    Feed.countDocuments({ ...dayFilter, type: 'thread' }),
    Feed.countDocuments({ ...dayFilter, type: 'reply' }),
  ]);

  const totalReviewed = approvedCount + rejectedCount;
  const approvalRate = totalReviewed > 0 ? approvedCount / totalReviewed : 0;

  await DailyStats.findOneAndUpdate(
    { date: today },
    {
      $set: {
        scanner: { totalScanned, totalHit: totalHit, hitRate: Math.round(hitRate * 100) / 100 },
        feeds: { generated: generatedCount, approved: approvedCount, rejected: rejectedCount, posted: postedCount, failed: failedCount },
        trends: { pulled: trendsPulled, used: trendsWithFeeds },
        posts: { threads: threadCount, replies: replyCount },
        quality: { approvalRate: Math.round(approvalRate * 100) / 100, duplicateCount },
      },
    },
    { upsert: true, new: true }
  );
}
