import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { connectDB, disconnectDB, getPrisma } from './shared/database.js';
import { seedAdmin, cleanupExpiredTokens } from './modules/auth/auth.service.js';
import { seed as seedConfigs } from './modules/config/config.service.js';
import { cleanupOldLogs } from './modules/audit/audit.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import { runHealthCheck } from './shared/health-monitor.js';
import { CONFIG_PRESETS } from './seeds/config.seeds.js';
import { seedData } from './seeds/import-data.js';
import { execSync } from 'child_process';
import logger from './shared/logger.js';

const PORT: string | number = process.env.PORT || 8080;

async function start(): Promise<void> {
  // Run Prisma migrations on startup (safe: only applies pending migrations)
  try {
    logger.info('Running Prisma migrate deploy...');
    // Resolve any previously failed migrations
    try { execSync('npx prisma migrate resolve --rolled-back 20260412_init 2>/dev/null', { stdio: 'pipe' }); } catch {}
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Prisma migrate deploy completed');
  } catch (err) {
    logger.warn({ err }, 'Prisma migrate deploy failed (may be first run without migrations)');
  }

  await connectDB();
  await seedAdmin();
  await seedConfigs(CONFIG_PRESETS);
  await seedData();

  // --- In-process Cron Jobs (replaces Cloud Scheduler for internal tasks) ---

  // Daily reset: midnight HKT
  cron.schedule('0 0 * * *', async () => {
    try {
      const prisma = getPrisma();
      await prisma.persona.updateMany({ data: { postsToday: 0, cooldownUntil: null } });
      const tokensRemoved = await cleanupExpiredTokens();
      const logsRemoved = await cleanupOldLogs();
      logger.info({ tokensRemoved, logsRemoved }, 'Daily reset + cleanup completed');
    } catch (err) {
      logger.error({ err }, 'Daily reset failed');
    }
  }, { timezone: 'Asia/Hong_Kong' });

  // Stats aggregator: every hour at :05
  cron.schedule('5 * * * *', async () => {
    try {
      await aggregateDailyStats();
    } catch (err) {
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
