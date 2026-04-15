// backend/src/modules/tasks/tasks.controller.ts
import { Request, Response } from 'express';
import { getPrisma } from '../../shared/database.js';
import { scanBoard, getBoardsDueForScan } from '../scanner/scanner.service.js';
import { pullTrends } from '../trends/trends.service.js';
import { postFeed } from '../poster/poster.service.js';
import { pullAndStore } from '../google-trends/google-trends.service.js';
import * as configService from '../config/config.service.js';
import { logTask } from '../task-log/task-log.service.js';
import { preflight } from '../../shared/health-monitor.js';
import logger from '../../shared/logger.js';

export async function scannerTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  // Pre-check Gemini + BK Forum connectivity
  const failures = await preflight();
  if (failures.length > 0) {
    res.json({ skipped: true, reason: 'preflight_failed', failures });
    return;
  }

  const { fid, triggeredBy = 'cron' } = req.body || {};

  try {
    const boardsToScan = fid
      ? [{ fid, name: '' }]
      : await getBoardsDueForScan();

    const results = [];
    for (const board of boardsToScan) {
      const start = Date.now();
      const stats = await scanBoard(board.fid);
      const duration = Date.now() - start;

      // 记录所有扫描结果（包括无命中），确保已扫描总数准确
      await logTask('scanner', {
        status: stats.status === 'interrupted' ? 'failed' : (stats.status === 'skipped' ? 'skipped' : 'completed'),
        duration,
        result: stats,
        triggeredBy,
      });
      results.push(stats);
    }

    res.json({ success: true, boards: results.length, results });
  } catch (err: any) {
    await logTask('scanner', { status: 'failed', error: err.message, triggeredBy });
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

  // Pre-check Gemini + BK Forum connectivity
  const failures = await preflight();
  if (failures.length > 0) {
    res.json({ skipped: true, reason: 'preflight_failed', failures });
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

  // 不再有 approved 状态，批量定时发布已移除（发布在审核时同步完成）
  res.json({ success: true, posted: 0, reason: 'batch posting removed — publish happens at review time' });
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
