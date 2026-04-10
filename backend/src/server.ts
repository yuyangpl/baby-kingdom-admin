import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, disconnectRedis } from './shared/redis.js';
import { initSocketIO } from './shared/socket.js';
import { initQueues } from './modules/queue/queue.service.js';
import { seedAdmin } from './modules/auth/auth.service.js';
import { seed as seedConfigs } from './modules/config/config.service.js';
import { CONFIG_PRESETS } from './seeds/config.seeds.js';
import { seedImportData } from './seeds/import-data.js';
import logger from './shared/logger.js';

const PORT: string | number = process.env.PORT || 3000;

async function start(): Promise<void> {
  await connectDB();
  getRedis();
  await seedAdmin();
  await seedConfigs(CONFIG_PRESETS);
  await seedImportData();

  // Create HTTP server and attach Socket.io
  const httpServer: http.Server = http.createServer(app);
  initSocketIO(httpServer);

  // Initialize BullMQ queues
  initQueues();

  httpServer.listen(PORT, () => {
    logger.info(`Backend listening on port ${PORT} (HTTP + WebSocket)`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully`);
    httpServer.close(async () => {
      await disconnectRedis();
      await disconnectDB();
      logger.info('Server shut down');
      process.exit(0);
    });

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
