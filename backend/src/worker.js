import 'dotenv/config';
import { Worker } from 'bullmq';
import cron from 'node-cron';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, connectRedis, disconnectRedis } from './shared/redis.js';
import { initQueues, getQueue, recordJob } from './modules/queue/queue.service.js';
import { scanForumThreads } from './modules/scanner/scanner.service.js';
import { pullTrends } from './modules/trends/trends.service.js';
import { postFeed } from './modules/poster/poster.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import Persona from './modules/persona/persona.model.js';
import logger from './shared/logger.js';

async function start() {
  await connectDB();
  await connectRedis();
  initQueues();

  const connection = getRedis();

  // --- Queue Processors ---

  const scannerWorker = new Worker('scanner', async (job) => {
    logger.info({ jobId: job.id }, 'Scanner job started');
    const startedAt = new Date();
    try {
      const stats = await scanForumThreads();
      await recordJob('scanner', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: stats, triggeredBy: job.data?.triggeredBy || 'cron' });
      return stats;
    } catch (err) {
      await recordJob('scanner', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy: job.data?.triggeredBy || 'cron' });
      throw err;
    }
  }, { connection, concurrency: 1 });

  const trendsWorker = new Worker('trends', async (job) => {
    logger.info({ jobId: job.id }, 'Trends job started');
    const startedAt = new Date();
    try {
      const trends = await pullTrends();
      await recordJob('trends', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { pulled: trends.length }, triggeredBy: job.data?.triggeredBy || 'cron' });
      return { pulled: trends.length };
    } catch (err) {
      await recordJob('trends', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy: job.data?.triggeredBy || 'cron' });
      throw err;
    }
  }, { connection, concurrency: 1 });

  const posterWorker = new Worker('poster', async (job) => {
    logger.info({ jobId: job.id, feedId: job.data?.feedId }, 'Poster job started');
    const startedAt = new Date();
    try {
      const feed = await postFeed(job.data.feedId, null, '');
      await recordJob('poster', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { feedId: feed.feedId, postId: feed.postId }, triggeredBy: 'manual' });
      return { posted: true };
    } catch (err) {
      await recordJob('poster', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy: 'manual' });
      throw err;
    }
  }, {
    connection,
    concurrency: 1,
    limiter: { max: 1, duration: 35000 }, // 35s between posts
  });

  const dailyResetWorker = new Worker('daily-reset', async (job) => {
    logger.info('Daily reset started');
    const startedAt = new Date();
    try {
      await Persona.updateMany({}, { $set: { postsToday: 0, cooldownUntil: null } });
      await recordJob('daily-reset', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { reset: true }, triggeredBy: 'cron' });
      logger.info('Daily post counters reset');
    } catch (err) {
      await recordJob('daily-reset', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy: 'cron' });
      throw err;
    }
  }, { connection, concurrency: 1 });

  const statsWorker = new Worker('stats-aggregator', async (job) => {
    logger.info('Stats aggregation started');
    const startedAt = new Date();
    try {
      await aggregateDailyStats();
      await recordJob('stats-aggregator', { jobId: job.id, status: 'completed', startedAt, completedAt: new Date(), result: { aggregated: true }, triggeredBy: 'cron' });
    } catch (err) {
      await recordJob('stats-aggregator', { jobId: job.id, status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy: 'cron' });
      throw err;
    }
  }, { connection, concurrency: 1 });

  // --- Cron Scheduler ---
  // Only one worker instance should run cron (leader election via Redis lock)

  const LOCK_KEY = 'worker:cron:leader';
  const LOCK_TTL = 60; // seconds

  async function tryAcquireLock() {
    const redis = getRedis();
    const result = await redis.set(LOCK_KEY, process.pid.toString(), 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  }

  async function renewLock() {
    const redis = getRedis();
    await redis.expire(LOCK_KEY, LOCK_TTL);
  }

  const isLeader = await tryAcquireLock();

  if (isLeader) {
    logger.info('This worker is the cron leader');

    // Renew lock periodically
    setInterval(() => renewLock(), (LOCK_TTL / 2) * 1000);

    // Scanner: every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      const q = getQueue('scanner');
      if (q && !(await q.isPaused())) {
        await q.add('cron-scan', { triggeredBy: 'cron' });
        logger.info('Cron: scanner job queued');
      }
    });

    // Trends: every hour
    cron.schedule('0 * * * *', async () => {
      const q = getQueue('trends');
      if (q && !(await q.isPaused())) {
        await q.add('cron-trends', { triggeredBy: 'cron' });
        logger.info('Cron: trends job queued');
      }
    });

    // Daily reset: midnight HKT (UTC+8 = 16:00 UTC)
    cron.schedule('0 16 * * *', async () => {
      const q = getQueue('daily-reset');
      if (q) {
        await q.add('cron-daily-reset', { triggeredBy: 'cron' });
        logger.info('Cron: daily-reset job queued');
      }
    });

    // Stats aggregator: every hour at :05
    cron.schedule('5 * * * *', async () => {
      const q = getQueue('stats-aggregator');
      if (q) {
        await q.add('cron-stats', { triggeredBy: 'cron' });
        logger.info('Cron: stats-aggregator job queued');
      }
    });

    logger.info('Cron jobs registered: scanner(30m), trends(1h), daily-reset(midnight), stats(1h)');
  } else {
    logger.info('This worker is NOT the cron leader, only processing jobs');
  }

  logger.info('Worker started with 5 queue processors');

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, worker shutting down`);
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
