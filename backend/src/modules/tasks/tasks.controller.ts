// backend/src/modules/tasks/tasks.controller.ts
import { Request, Response } from 'express';
import { getPrisma } from '../../shared/database.js';
import { recordJob } from '../queue/queue.service.js';
import { scanBoard, getBoardsDueForScan } from '../scanner/scanner.service.js';
import { pullTrends } from '../trends/trends.service.js';
import { postFeed } from '../poster/poster.service.js';
import { pullAndStore } from '../google-trends/google-trends.service.js';
import * as configService from '../config/config.service.js';
import logger from '../../shared/logger.js';

export async function scannerTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { fid, triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
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
}

export async function trendsTask(req: Request, res: Response): Promise<void> {
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
}

export async function posterTask(req: Request, res: Response): Promise<void> {
  const { feedId, triggeredBy = 'manual' } = req.body || {};
  if (!feedId) {
    res.status(400).json({ error: 'feedId is required' });
    return;
  }

  const prisma = getPrisma();
  const startedAt = new Date();

  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed || feed.postId) {
    res.json({ skipped: true, reason: feed ? 'already posted' : 'not found' });
    return;
  }

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
}

export async function gtrendsTask(req: Request, res: Response): Promise<void> {
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
}
