import 'dotenv/config';
import app from './app.js';
import { connectDB, disconnectDB } from './shared/database.js';
import { initQueues } from './modules/queue/queue.service.js';
import { seedAdmin } from './modules/auth/auth.service.js';
import { seed as seedConfigs } from './modules/config/config.service.js';
import { CONFIG_PRESETS } from './seeds/config.seeds.js';
import logger from './shared/logger.js';

const PORT: string | number = process.env.PORT || 3000;

async function start(): Promise<void> {
  await connectDB();
  await seedAdmin();
  await seedConfigs(CONFIG_PRESETS);

  // Initialize queue service
  initQueues();

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
