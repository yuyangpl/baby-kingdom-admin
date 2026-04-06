import 'dotenv/config';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, disconnectRedis } from './shared/redis.js';
import logger from './shared/logger.js';

async function start() {
  await connectDB();
  getRedis();

  logger.info('Worker started');

  // Queue processors will be registered here in Plan 8

  const shutdown = async (signal) => {
    logger.info(`${signal} received, worker shutting down`);
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
