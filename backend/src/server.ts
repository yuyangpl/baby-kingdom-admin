import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { connectDB, disconnectDB, getPrisma } from './shared/database.js';
import { initQueues, recordJob } from './modules/queue/queue.service.js';
import { seedAdmin, cleanupExpiredTokens } from './modules/auth/auth.service.js';
import { seed as seedConfigs } from './modules/config/config.service.js';
import { cleanupOldLogs } from './modules/audit/audit.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import { runHealthCheck } from './shared/health-monitor.js';
import { CONFIG_PRESETS } from './seeds/config.seeds.js';
import { seedData } from './seeds/import-data.js';
import logger from './shared/logger.js';

const PORT: string | number = process.env.PORT || 3000;

async function start(): Promise<void> {
  await connectDB();
  await seedAdmin();
  await seedConfigs(CONFIG_PRESETS);
  await seedData();

  // Initialize queue service
  initQueues();

  // --- In-process Cron Jobs (replaces Cloud Scheduler for internal tasks) ---

  // Daily reset: midnight HKT
  cron.schedule('0 0 * * *', async () => {
    const startedAt = new Date();
    try {
      const prisma = getPrisma();
      await prisma.persona.updateMany({ data: { postsToday: 0, cooldownUntil: null } });
      const tokensRemoved = await cleanupExpiredTokens();
      const logsRemoved = await cleanupOldLogs();
      await recordJob('daily-reset', { status: 'completed', startedAt, completedAt: new Date(), result: { reset: true, tokensRemoved, logsRemoved }, triggeredBy: 'cron' });
      logger.info({ tokensRemoved, logsRemoved }, 'Daily reset + cleanup completed');
    } catch (err) {
      await recordJob('daily-reset', { status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      logger.error({ err }, 'Daily reset failed');
    }
  }, { timezone: 'Asia/Hong_Kong' });

  // Stats aggregator: every hour at :05
  cron.schedule('5 * * * *', async () => {
    const startedAt = new Date();
    try {
      await aggregateDailyStats();
      await recordJob('stats-aggregator', { status: 'completed', startedAt, completedAt: new Date(), result: { aggregated: true }, triggeredBy: 'cron' });
    } catch (err) {
      await recordJob('stats-aggregator', { status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      logger.error({ err }, 'Stats aggregation failed');
    }
  });

  // Health monitor: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runHealthCheck();
    } catch (err) {
      logger.error({ err }, 'Health check failed');
    }
  });

  logger.info('In-process cron registered: daily-reset(0:00 HKT), stats(:05), health(5m)');

  app.listen(PORT, () => {
    logger.info(`Backend API listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully`);
    await disconnectDB();
    logger.info('Server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
