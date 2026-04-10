import 'dotenv/config';
import crypto from 'crypto';
import { Worker, Job } from 'bullmq';
import cron from 'node-cron';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, connectRedis, disconnectRedis } from './shared/redis.js';
import { initQueues, addToQueue, recordJob } from './modules/queue/queue.service.js';
import { scanBoard, getActiveBoards, getBoardsDueForScan } from './modules/scanner/scanner.service.js';
import { pullTrends } from './modules/trends/trends.service.js';
import { postFeed } from './modules/poster/poster.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import Persona from './modules/persona/persona.model.js';
import Feed from './modules/feed/feed.model.js';
import logger from './shared/logger.js';
import { runHealthCheck } from './shared/health-monitor.js';
import { pullAndStore } from './modules/google-trends/google-trends.service.js';
import * as configService from './modules/config/config.service.js';

// Fix 6: Use UUID instead of PID so it is unique across containers
const WORKER_ID: string = crypto.randomUUID();

async function start(): Promise<void> {
  await connectDB();
  await connectRedis();
  initQueues();

  const connection = getRedis();

  // Fix 5: Track cron tasks and interval IDs for clean shutdown
  const cronTasks: ReturnType<typeof cron.schedule>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  // --- Queue Processors ---

  const scannerWorker = new Worker('scanner', async (job: Job) => {
    const { fid, boardName, triggeredBy } = job.data || {};
    logger.info({ jobId: job.id, fid, boardName }, 'Scanner job started');
    const startedAt = new Date();
    try {
      const stats = await scanBoard(fid);
      const jobStatus = stats.status === 'interrupted' ? 'completed' : 'completed';
      try {
        await recordJob('scanner', { jobId: job.id, status: jobStatus, startedAt, completedAt: new Date(), result: stats, triggeredBy: triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record scanner job completion');
      }
      return stats;
    } catch (err) {
      try {
        await recordJob('scanner', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record scanner job failure');
      }
      throw err;
    }
  }, { connection, concurrency: 1 });

  const trendsWorker = new Worker('trends', async (job: Job) => {
    logger.info({ jobId: job.id }, 'Trends job started');
    const startedAt = new Date();
    try {
      const result = await pullTrends();
      const pulled = Array.isArray(result.trends) ? result.trends.length : 0;
      const feedsGenerated = result.feedsGenerated ?? 0;
      try {
        await recordJob('trends', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { pulled, feedsGenerated }, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record trends job completion');
      }
      return { pulled, feedsGenerated };
    } catch (err) {
      try {
        await recordJob('trends', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record trends job failure');
      }
      throw err;
    }
  }, { connection, concurrency: 1 });

  const posterWorker = new Worker('poster', async (job: Job) => {
    const { feedId, triggeredBy } = job.data || {};
    logger.info({ jobId: job.id, feedId, triggeredBy }, 'Poster job started');
    const startedAt = new Date();

    // Idempotency check — skip if already posted
    const feed = await Feed.findById(feedId);
    if (!feed || feed.postId) {
      logger.info({ feedId, postId: feed?.postId }, 'Feed already posted or not found, skipping');
      return { posted: false, skipped: true };
    }

    // Auto trigger checks board.enableAutoReply; manual trigger always posts
    if (triggeredBy === 'approve') {
      const { ForumBoard } = await import('./modules/forum/forum.model.js');
      const board = feed.threadFid ? await ForumBoard.findOne({ fid: feed.threadFid }) : null;
      if (!board?.enableAutoReply) {
        logger.info({ feedId: feed.feedId, fid: feed.threadFid }, 'Board auto-reply not enabled, skipping auto-post');
        return { posted: false, skipped: true, reason: 'auto-reply disabled' };
      }
    }

    try {
      const result = await postFeed(feedId, undefined, '');
      try {
        await recordJob('poster', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { feedId: result.feedId, postId: result.postId }, triggeredBy: triggeredBy || 'manual' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record poster job completion');
      }
      return { posted: true };
    } catch (err) {
      try {
        await recordJob('poster', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: triggeredBy || 'manual' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record poster job failure');
      }
      throw err;
    }
  }, {
    connection,
    concurrency: 1,
    limiter: { max: 1, duration: 35000 }, // 35s between posts
  });

  const dailyResetWorker = new Worker('daily-reset', async (job: Job) => {
    logger.info('Daily reset started');
    const startedAt = new Date();
    try {
      await Persona.updateMany({}, { $set: { postsToday: 0, cooldownUntil: null } });
      try {
        await recordJob('daily-reset', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { reset: true }, triggeredBy: 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record daily-reset job completion');
      }
      logger.info('Daily post counters reset');
    } catch (err) {
      try {
        await recordJob('daily-reset', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record daily-reset job failure');
      }
      throw err;
    }
  }, { connection, concurrency: 1 });

  const statsWorker = new Worker('stats-aggregator', async (job: Job) => {
    logger.info('Stats aggregation started');
    const startedAt = new Date();
    try {
      await aggregateDailyStats();
      try {
        await recordJob('stats-aggregator', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { aggregated: true }, triggeredBy: 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record stats-aggregator job completion');
      }
    } catch (err) {
      try {
        await recordJob('stats-aggregator', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record stats-aggregator job failure');
      }
      throw err;
    }
  }, { connection, concurrency: 1 });

  const googleTrendsWorker = new Worker('google-trends', async (job: Job) => {
    logger.info('Google Trends pull started');
    const startedAt = new Date();
    try {
      const result = await pullAndStore();
      try {
        await recordJob('google-trends', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record google-trends job completion');
      }
      logger.info({ pullId: result.pullId, count: result.count }, 'Google Trends pull completed');
    } catch (err) {
      try {
        await recordJob('google-trends', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record google-trends job failure');
      }
      throw err;
    }
  }, { connection, concurrency: 1 });

  // --- Cron Scheduler ---
  // Only one worker instance should run cron (leader election via Redis lock)

  const LOCK_KEY = 'worker:cron:leader';
  const LOCK_TTL = 60; // seconds

  // Fix 6: Use WORKER_ID (UUID) instead of process.pid so it is unique per container
  async function tryAcquireLock(): Promise<boolean> {
    const redis = getRedis();
    const result = await redis.set(LOCK_KEY, WORKER_ID, 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  }

  async function renewLock(): Promise<void> {
    const redis = getRedis();
    await redis.expire(LOCK_KEY, LOCK_TTL);
  }

  async function registerCronJobs(): Promise<void> {
    logger.info('This worker is the cron leader, registering cron jobs');

    // Renew lock every 30s (half of LOCK_TTL)
    intervals.push(setInterval(() => renewLock(), (LOCK_TTL / 2) * 1000));

    // Scanner: check every 5 min which boards are due for scan (based on board.scanInterval)
    intervals.push(setInterval(async () => {
      const boards = await getBoardsDueForScan();
      for (const board of boards) {
        await addToQueue('scanner', { fid: board.fid, boardName: board.name, triggeredBy: 'cron' });
      }
      if (boards.length > 0) {
        logger.info({ count: boards.length }, 'Cron: scanner jobs queued for due boards');
      }
    }, 5 * 60 * 1000));

    // Trends: configurable interval in minutes (default 60)
    const trendsIntervalMin = parseInt(await configService.getValue('TREND_PULL_INTERVAL_MIN') || '60', 10);
    const trendsIntervalMs = trendsIntervalMin * 60 * 1000;
    intervals.push(setInterval(async () => {
      await addToQueue('trends', { triggeredBy: 'cron' });
      logger.info('Cron: trends job queued');
    }, trendsIntervalMs));

    // Daily reset: midnight HKT (UTC+8 = 16:00 UTC)
    cronTasks.push(cron.schedule('0 16 * * *', async () => {
      await addToQueue('daily-reset', { triggeredBy: 'cron' });
      logger.info('Cron: daily-reset job queued');
    }));

    // Stats aggregator: every hour at :05
    cronTasks.push(cron.schedule('5 * * * *', async () => {
      await addToQueue('stats-aggregator', { triggeredBy: 'cron' });
      logger.info('Cron: stats-aggregator job queued');
    }));

    // Google Trends: configurable interval (default 30 minutes)
    const gtrendsInterval = parseInt(await configService.getValue('GOOGLE_TRENDS_PULL_INTERVAL') || '30', 10);
    const gtrendsCron = `*/${gtrendsInterval} * * * *`;
    cronTasks.push(cron.schedule(gtrendsCron, async () => {
      await addToQueue('google-trends', { triggeredBy: 'cron' });
      logger.info('Cron: google-trends job queued');
    }));

    // Health monitor: every 5 minutes
    cronTasks.push(cron.schedule('*/5 * * * *', async () => {
      try {
        await runHealthCheck();
        logger.info('Cron: health check completed');
      } catch (err) {
        logger.error({ err }, 'Cron: health check failed');
      }
    }));

    logger.info(`Cron jobs registered: scanner(per-board interval, check 5m), trends(${trendsIntervalMin}m), daily-reset(midnight), stats(1h), google-trends(${gtrendsInterval}m), health(5m)`);
  }

  const isLeader = await tryAcquireLock();

  if (isLeader) {
    await registerCronJobs();
  } else {
    logger.info('This worker is NOT the cron leader, only processing jobs');

    // Fix 2: Periodically try to acquire the lock so this worker takes over if the leader dies
    intervals.push(setInterval(async () => {
      const acquired = await tryAcquireLock();
      if (acquired) {
        logger.info('Non-leader worker acquired cron lock — becoming the new leader');
        await registerCronJobs();
        // Remove this re-election interval now that we are the leader
        // (renewLock interval was added inside registerCronJobs; this one stays until shutdown)
      }
    }, LOCK_TTL * 1000)); // check every 60s (matches lock TTL expiry window)
  }

  logger.info('Worker started with 5 queue processors');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, worker shutting down`);

    // Fix 5: Stop all cron tasks and clear intervals before closing workers
    cronTasks.forEach(task => task.stop());
    intervals.forEach(id => clearInterval(id));

    await scannerWorker.close();
    await trendsWorker.close();
    await posterWorker.close();
    await dailyResetWorker.close();
    await statsWorker.close();
    await disconnectRedis();
    await disconnectDB();
    logger.info('Worker shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker');
  process.exit(1);
});
