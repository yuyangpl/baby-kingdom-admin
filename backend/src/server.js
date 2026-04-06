import 'dotenv/config';
import app from './app.js';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, disconnectRedis } from './shared/redis.js';
import { seedAdmin } from './modules/auth/auth.service.js';
import logger from './shared/logger.js';

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  getRedis();
  await seedAdmin();

  const server = app.listen(PORT, () => {
    logger.info(`Backend listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectRedis();
      await disconnectDB();
      logger.info('Server shut down');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
