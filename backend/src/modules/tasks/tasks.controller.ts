// backend/src/modules/tasks/tasks.controller.ts
import { Request, Response } from 'express';
import { getPrisma } from '../../shared/database.js';
import { scanBoard, getBoardsDueForScan } from '../scanner/scanner.service.js';
import { pullTrends } from '../trends/trends.service.js';
import { postFeed } from '../poster/poster.service.js';
import { pullAndStore } from '../google-trends/google-trends.service.js';
import * as configService from '../config/config.service.js';
import { logTask } from '../task-log/task-log.service.js';
import logger from '../../shared/logger.js';

export async function scannerTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { fid, triggeredBy = 'cron' } = req.body || {};
  const startedAt = Date.now();

  try {
    if (fid) {
      const stats = await scanBoard(fid);
      await logTask('scanner', { status: 'completed', duration: Date.now() - startedAt, result: stats, triggeredBy });
      res.json({ success: true, stats });
    } else {
      const boards = await getBoardsDueForScan();
      const results = [];
      for (const board of boards) {
        const stats = await scanBoard(board.fid);
        results.push(stats);
      }
      await logTask('scanner', { status: 'completed', duration: Date.now() - startedAt, result: { boards: results.length, results }, triggeredBy });
      res.json({ success: true, boards: results.length, results });
    }
  } catch (err: any) {
    await logTask('scanner', { status: 'failed', duration: Date.now() - startedAt, error: err.message, triggeredBy });
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
  const startedAt = Date.now();

  try {
    const result = await pullTrends();
    const pulled = Array.isArray(result.trends) ? result.trends.length : 0;
    await logTask('trends', { status: 'completed', duration: Date.now() - startedAt, result: { pulled, feedsGenerated: result.feedsGenerated }, triggeredBy });
    res.json({ success: true, pulled, feedsGenerated: result.feedsGenerated });
  } catch (err: any) {
    await logTask('trends', { status: 'failed', duration: Date.now() - startedAt, error: err.message, triggeredBy });
    logger.error({ err }, 'Trends task failed');
    res.status(500).json({ error: err.message });
  }
}

export async function posterTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('POSTER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { feedId, triggeredBy = 'cron' } = req.body || {};
  const startedAt = Date.now();
  const prisma = getPrisma();

  // 单条模式：指定 feedId 发布
  if (feedId) {
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
      await logTask('poster', { status: 'completed', duration: Date.now() - startedAt, result: { feedId, posted: true }, triggeredBy });
      res.json({ success: true, posted: true });
    } catch (err: any) {
      await logTask('poster', { status: 'failed', duration: Date.now() - startedAt, error: err.message, triggeredBy });
      logger.error({ err, feedId }, 'Poster task failed');
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // 批量模式（定时任务）：查找所有 approved 的 feed，逐个发布
  const intervalSec = parseInt(await configService.getValue('BK_POST_INTERVAL_SEC') || '35', 10);
  const approvedFeeds = await prisma.feed.findMany({
    where: { status: 'approved', postId: null },
    orderBy: { createdAt: 'asc' },
    take: 5, // 每次最多处理 5 条，避免超时
  });

  if (approvedFeeds.length === 0) {
    res.json({ success: true, posted: 0, reason: 'no approved feeds' });
    return;
  }

  let posted = 0;
  const errors: string[] = [];
  for (const feed of approvedFeeds) {
    try {
      await postFeed(feed.id, undefined, '');
      posted++;
      // 遵守 BK 论坛限频
      if (posted < approvedFeeds.length) {
        await new Promise(r => setTimeout(r, intervalSec * 1000));
      }
    } catch (err: any) {
      logger.error({ err, feedId: feed.id }, 'Poster batch: single feed failed');
      errors.push(`${feed.feedId}: ${err.message}`);
    }
  }

  await logTask('poster', { status: errors.length > 0 ? 'failed' : 'completed', duration: Date.now() - startedAt, result: { posted, total: approvedFeeds.length, errors }, triggeredBy });
  res.json({ success: true, posted, total: approvedFeeds.length, errors: errors.length > 0 ? errors : undefined });
}

export async function gtrendsTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('GTRENDS_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = Date.now();

  try {
    const result = await pullAndStore();
    await logTask('google-trends', { status: 'completed', duration: Date.now() - startedAt, result: { pullId: result.pullId, count: result.count }, triggeredBy });
    res.json({ success: true, pullId: result.pullId, count: result.count });
  } catch (err: any) {
    await logTask('google-trends', { status: 'failed', duration: Date.now() - startedAt, error: err.message, triggeredBy });
    logger.error({ err }, 'Google Trends task failed');
    res.status(500).json({ error: err.message });
  }
}
