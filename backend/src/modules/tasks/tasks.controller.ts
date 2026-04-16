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

  // 批量自动发帖：遍历所有 pending feed
  // - 首次扫到(attempts=0)：评分达标 → 直接发帖，不达标 → attempts+1
  // - 再次扫到(attempts>=1)：重新生成内容 → 评分达标 → 发帖，不达标 → attempts+1 留待下次
  const threshold = parseInt(await configService.getValue('AUTO_POST_THRESHOLD') || '80', 10);
  const { regenerate } = await import('../feed/feed.service.js');

  const allPending = await prisma.feed.findMany({
    where: { status: 'pending', postId: null },
    orderBy: [{ createdAt: 'asc' }],
  });

  if (allPending.length === 0) {
    res.json({ success: true, posted: 0, scanned: 0, regenerated: 0, reason: 'no pending feeds' });
    return;
  }

  let posted = 0, skipped = 0, regenerated = 0;
  const details: Array<{ feedId: string; action: string }> = [];

  for (const feed of allPending) {
    // Check board enableAutoReply for replies
    if (feed.postType === 'reply' && feed.threadFid) {
      const board = await prisma.forumBoard.findFirst({ where: { fid: feed.threadFid } });
      if (!board?.enableAutoReply) { skipped++; continue; }
    }

    // Check persona active + daily limit
    const persona = feed.personaId
      ? await prisma.persona.findFirst({ where: { accountId: feed.personaId, isActive: true } })
      : null;
    if (!persona) { skipped++; continue; }
    if ((persona.postsToday || 0) >= persona.maxPostsPerDay) { skipped++; continue; }

    let currentFeed = feed;

    // Already scanned before → regenerate content first
    if (feed.autoPostAttempts > 0) {
      try {
        currentFeed = await regenerate(feed.id, {}, 'system', '');
        regenerated++;
        logger.info({ feedId: feed.feedId, attempt: feed.autoPostAttempts + 1 }, 'poster: regenerated content');
      } catch (err) {
        logger.warn({ err, feedId: feed.feedId }, 'poster: regenerate failed, skip');
        await prisma.feed.update({ where: { id: feed.id }, data: { autoPostAttempts: feed.autoPostAttempts + 1 } });
        details.push({ feedId: feed.feedId, action: 'regen_failed' });
        continue;
      }
    }

    // Check score
    const score = currentFeed.relevanceScore ?? 0;
    if (score >= threshold) {
      try {
        await postFeed(feed.id, undefined, '');
        posted++;
        details.push({ feedId: feed.feedId, action: 'posted' });
        logger.info({ feedId: feed.feedId, score, threshold }, 'poster: auto-posted');
      } catch (err: any) {
        // 发帖失败不重试，标记 failed
        logger.error({ err, feedId: feed.feedId }, 'poster: post failed');
        details.push({ feedId: feed.feedId, action: `post_failed: ${err.message}` });
      }
    } else {
      // 不达标，+1 attempts，留待下次扫描
      await prisma.feed.update({ where: { id: feed.id }, data: { autoPostAttempts: feed.autoPostAttempts + 1 } });
      details.push({ feedId: feed.feedId, action: `below_threshold(${score}<${threshold})` });
    }
  }

  await logTask('poster', {
    status: 'completed', duration: Date.now() - startedAt,
    result: { posted, scanned: allPending.length, regenerated, skipped, threshold },
    triggeredBy,
  });

  res.json({ success: true, posted, scanned: allPending.length, regenerated, skipped, threshold, details });
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
