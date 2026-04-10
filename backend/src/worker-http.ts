/**
 * Worker HTTP Service — replaces BullMQ Worker process.
 * Each queue processor is now a POST /tasks/* endpoint.
 * Triggered by Cloud Tasks (production) or direct HTTP calls (development).
 */
import 'dotenv/config';
import express from 'express';
import { connectDB, disconnectDB, getPrisma } from './shared/database.js';
import { recordJob } from './modules/queue/queue.service.js';
import { scanBoard, getBoardsDueForScan } from './modules/scanner/scanner.service.js';
import { pullTrends } from './modules/trends/trends.service.js';
import { postFeed } from './modules/poster/poster.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import { pullAndStore } from './modules/google-trends/google-trends.service.js';
import { runHealthCheck } from './shared/health-monitor.js';
import * as configService from './modules/config/config.service.js';
import { cleanupExpiredTokens } from './modules/auth/auth.service.js';
import { cleanupOldLogs } from './modules/audit/audit.service.js';
import logger from './shared/logger.js';

const app = express();
app.use(express.json());

// --- Cloud Tasks / Cloud Scheduler auth middleware ---
function verifyTaskRequest(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // In production: verify OIDC token from Cloud Tasks/Scheduler
  // For now: allow all requests (local dev + Cloud Tasks both work)
  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_OIDC === 'true') {
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    // TODO: Verify OIDC token with google-auth-library in production
  }
  next();
}

app.use('/tasks', verifyTaskRequest);

// --- Scanner ---
app.post('/tasks/scanner', async (req, res) => {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { fid, triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    // If fid specified, scan that board; otherwise scan all due boards
    if (fid) {
      const stats = await scanBoard(fid);
      await recordJob('scanner', { status: 'completed', startedAt, completedAt: new Date(), result: stats, triggeredBy });
      res.json({ success: true, stats });
    } else {
      const boards = await getBoardsDueForScan();
      const results = [];
      for (const board of boards) {
        const stats = await scanBoard(board.fid);
        results.push(stats);
      }
      await recordJob('scanner', { status: 'completed', startedAt, completedAt: new Date(), result: { boards: results.length }, triggeredBy });
      res.json({ success: true, boards: results.length, results });
    }
  } catch (err: any) {
    await recordJob('scanner', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Scanner task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Trends ---
app.post('/tasks/trends', async (req, res) => {
  const paused = await configService.getValue('TRENDS_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    const result = await pullTrends();
    const pulled = Array.isArray(result.trends) ? result.trends.length : 0;
    await recordJob('trends', { status: 'completed', startedAt, completedAt: new Date(), result: { pulled, feedsGenerated: result.feedsGenerated }, triggeredBy });
    res.json({ success: true, pulled, feedsGenerated: result.feedsGenerated });
  } catch (err: any) {
    await recordJob('trends', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Trends task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Poster ---
app.post('/tasks/poster', async (req, res) => {
  const { feedId, triggeredBy = 'manual' } = req.body || {};
  if (!feedId) {
    res.status(400).json({ error: 'feedId is required' });
    return;
  }

  const prisma = getPrisma();
  const startedAt = new Date();

  // Idempotency check
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed || feed.postId) {
    res.json({ skipped: true, reason: feed ? 'already posted' : 'not found' });
    return;
  }

  // Auto-trigger checks board.enableAutoReply
  if (triggeredBy === 'approve') {
    const board = feed.threadFid ? await prisma.forumBoard.findFirst({ where: { fid: feed.threadFid } }) : null;
    if (!board?.enableAutoReply) {
      res.json({ skipped: true, reason: 'auto-reply disabled' });
      return;
    }
  }

  try {
    const result = await postFeed(feedId, undefined, '');
    await recordJob('poster', { status: 'completed', startedAt, completedAt: new Date(), result: { feedId: (result as any).feedId, postId: (result as any).postId }, triggeredBy });
    res.json({ success: true, posted: true });
  } catch (err: any) {
    await recordJob('poster', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err, feedId }, 'Poster task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Daily Reset ---
app.post('/tasks/daily-reset', async (req, res) => {
  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();
  const prisma = getPrisma();

  try {
    await prisma.persona.updateMany({ data: { postsToday: 0, cooldownUntil: null } });
    await recordJob('daily-reset', { status: 'completed', startedAt, completedAt: new Date(), result: { reset: true }, triggeredBy });

    // Also cleanup expired tokens and old audit logs
    const tokensRemoved = await cleanupExpiredTokens();
    const logsRemoved = await cleanupOldLogs();
    logger.info({ tokensRemoved, logsRemoved }, 'Daily cleanup completed');

    res.json({ success: true, reset: true, tokensRemoved, logsRemoved });
  } catch (err: any) {
    await recordJob('daily-reset', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Daily reset task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Stats Aggregator ---
app.post('/tasks/stats', async (req, res) => {
  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    await aggregateDailyStats();
    await recordJob('stats-aggregator', { status: 'completed', startedAt, completedAt: new Date(), result: { aggregated: true }, triggeredBy });
    res.json({ success: true, aggregated: true });
  } catch (err: any) {
    await recordJob('stats-aggregator', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Stats aggregation task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Google Trends ---
app.post('/tasks/gtrends', async (req, res) => {
  const paused = await configService.getValue('GTRENDS_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    const result = await pullAndStore();
    await recordJob('google-trends', { status: 'completed', startedAt, completedAt: new Date(), result, triggeredBy });
    res.json({ success: true, pullId: result.pullId, count: result.count });
  } catch (err: any) {
    await recordJob('google-trends', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Google Trends task failed');
    res.status(500).json({ error: err.message });
  }
});

// --- Health Check ---
app.get('/health', async (_req, res) => {
  try {
    const results = await runHealthCheck();
    res.json({ status: 'ok', services: results });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Start ---
const PORT = process.env.WORKER_PORT || 3001;

async function start(): Promise<void> {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Worker HTTP service listening on port ${PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, worker shutting down`);
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker HTTP service');
  process.exit(1);
});

export default app;
