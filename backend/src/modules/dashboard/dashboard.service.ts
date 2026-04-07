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
  const stats = await DailyStats.findOne({ date: today });
  return stats || { date: today, scanner: {}, feeds: {}, trends: {}, posts: {}, gemini: {}, quality: {} };
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

  const [
    generatedCount,
    approvedCount,
    rejectedCount,
    postedCount,
    failedCount,
    trendsPulled,
    trendsUsed,
    duplicateCount,
  ] = await Promise.all([
    Feed.countDocuments({ ...dayFilter }),
    Feed.countDocuments({ status: 'approved', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'rejected', reviewedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'posted', postedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Feed.countDocuments({ status: 'failed', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Trend.countDocuments(dayFilter),
    Trend.countDocuments({ ...dayFilter, isUsed: true }),
    Feed.countDocuments({ ...dayFilter, isDuplicate: true }),
  ]);

  const totalReviewed = approvedCount + rejectedCount;
  const approvalRate = totalReviewed > 0 ? approvedCount / totalReviewed : 0;

  await DailyStats.findOneAndUpdate(
    { date: today },
    {
      $set: {
        feeds: { generated: generatedCount, approved: approvedCount, rejected: rejectedCount, posted: postedCount, failed: failedCount },
        trends: { pulled: trendsPulled, used: trendsUsed },
        quality: { approvalRate: Math.round(approvalRate * 100) / 100, duplicateCount },
      },
    },
    { upsert: true, new: true }
  );
}
