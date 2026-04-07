import 'dotenv/config';
import crypto from 'crypto';
import { Worker, Job } from 'bullmq';
import cron from 'node-cron';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, connectRedis, disconnectRedis } from './shared/redis.js';
import { initQueues, getQueue, recordJob } from './modules/queue/queue.service.js';
import { scanForumThreads } from './modules/scanner/scanner.service.js';
import { pullTrends } from './modules/trends/trends.service.js';
import { postFeed } from './modules/poster/poster.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import Persona from './modules/persona/persona.model.js';
import Feed from './modules/feed/feed.model.js';
import logger from './shared/logger.js';
import { runHealthCheck } from './shared/health-monitor.js';
import { pullAndStore } from './modules/google-trends/google-trends.service.js';

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
    logger.info({ jobId: job.id }, 'Scanner job started');
    const startedAt = new Date();
    try {
      const stats = await scanForumThreads();
      // Fix 4: Wrap recordJob in try/catch so a record failure doesn't mask the result
      try {
        await recordJob('scanner', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: stats, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record scanner job completion');
      }
      return stats;
    } catch (err) {
      try {
        await recordJob('scanner', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: job.data?.triggeredBy || 'cron' });
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
      const trends = await pullTrends();
      try {
        await recordJob('trends', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { pulled: trends.length }, triggeredBy: job.data?.triggeredBy || 'cron' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record trends job completion');
      }
      return { pulled: trends.length };
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
    logger.info({ jobId: job.id, feedId: job.data?.feedId }, 'Poster job started');
    const startedAt = new Date();
    try {
      // Fix 3: Idempotency check — skip if already posted
      const feed = await Feed.findById(job.data.feedId);
      if (feed?.postId) {
        logger.info({ feedId: job.data.feedId, postId: feed.postId }, 'Feed already posted, skipping');
        return { posted: false, skipped: true };
      }

      const result = await postFeed(job.data.feedId, undefined, '');
      try {
        await recordJob('poster', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { feedId: result.feedId, postId: result.postId }, triggeredBy: 'manual' });
      } catch (recordErr) {
        logger.error({ recordErr }, 'Failed to record poster job completion');
      }
      return { posted: true };
    } catch (err) {
      try {
        await recordJob('poster', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'manual' });
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

  function registerCronJobs(): void {
    logger.info('This worker is the cron leader, registering cron jobs');

    // Renew lock every 30s (half of LOCK_TTL)
    intervals.push(setInterval(() => renewLock(), (LOCK_TTL / 2) * 1000));

    // Scanner: every 30 minutes
    cronTasks.push(cron.schedule('*/30 * * * *', async () => {
      const q = getQueue('scanner');
      if (q && !(await q.isPaused())) {
        await q.add('cron-scan', { triggeredBy: 'cron' });
        logger.info('Cron: scanner job queued');
      }
    }));

    // Trends: every hour
    cronTasks.push(cron.schedule('0 * * * *', async () => {
      const q = getQueue('trends');
      if (q && !(await q.isPaused())) {
        await q.add('cron-trends', { triggeredBy: 'cron' });
        logger.info('Cron: trends job queued');
      }
    }));

    // Daily reset: midnight HKT (UTC+8 = 16:00 UTC)
    cronTasks.push(cron.schedule('0 16 * * *', async () => {
      const q = getQueue('daily-reset');
      if (q) {
        await q.add('cron-daily-reset', { triggeredBy: 'cron' });
        logger.info('Cron: daily-reset job queued');
      }
    }));

    // Stats aggregator: every hour at :05
    cronTasks.push(cron.schedule('5 * * * *', async () => {
      const q = getQueue('stats-aggregator');
      if (q) {
        await q.add('cron-stats', { triggeredBy: 'cron' });
        logger.info('Cron: stats-aggregator job queued');
      }
    }));

    // Google Trends: every 30 minutes
    cronTasks.push(cron.schedule('*/30 * * * *', async () => {
      try {
        const result = await pullAndStore();
        logger.info({ pullId: result.pullId, count: result.count }, 'Cron: google-trends pull completed');
      } catch (err) {
        logger.error({ err }, 'Cron: google-trends pull failed');
      }
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

    logger.info('Cron jobs registered: scanner(30m), trends(1h), daily-reset(midnight), stats(1h), google-trends(30m), health(5m)');
  }

  const isLeader = await tryAcquireLock();

  if (isLeader) {
    registerCronJobs();
  } else {
    logger.info('This worker is NOT the cron leader, only processing jobs');

    // Fix 2: Periodically try to acquire the lock so this worker takes over if the leader dies
    intervals.push(setInterval(async () => {
      const acquired = await tryAcquireLock();
      if (acquired) {
        logger.info('Non-leader worker acquired cron lock — becoming the new leader');
        registerCronJobs();
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
