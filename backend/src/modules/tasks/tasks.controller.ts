// backend/src/modules/tasks/tasks.controller.ts
import { Request, Response } from 'express';
import { getPrisma } from '../../shared/database.js';
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

  const { fid } = req.body || {};

  try {
    if (fid) {
      const stats = await scanBoard(fid);
      res.json({ success: true, stats });
    } else {
      const boards = await getBoardsDueForScan();
      const results = [];
      for (const board of boards) {
        const stats = await scanBoard(board.fid);
        results.push(stats);
      }
      res.json({ success: true, boards: results.length, results });
    }
  } catch (err: any) {
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

  try {
    const result = await pullTrends();
    const pulled = Array.isArray(result.trends) ? result.trends.length : 0;
    res.json({ success: true, pulled, feedsGenerated: result.feedsGenerated });
  } catch (err: any) {
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
    await postFeed(feedId, undefined, '');
    res.json({ success: true, posted: true });
  } catch (err: any) {
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

  try {
    const result = await pullAndStore();
    res.json({ success: true, pullId: result.pullId, count: result.count });
  } catch (err: any) {
    logger.error({ err }, 'Google Trends task failed');
    res.status(500).json({ error: err.message });
  }
}
