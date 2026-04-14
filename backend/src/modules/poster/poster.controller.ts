import { Request, Response } from 'express';
import * as posterService from './poster.service.js';
import { getPrisma } from '../../shared/database.js';
import { success } from '../../shared/response.js';
import { BusinessError } from '../../shared/errors.js';
import logger from '../../shared/logger.js';

export async function postFeed(req: Request, res: Response): Promise<void> {
  const prisma = getPrisma();
  const feed = await prisma.feed.findUnique({ where: { id: req.params.id as string } });
  if (!feed) throw new BusinessError('Feed not found');
  if (feed.status !== 'approved') throw new BusinessError('Can only post approved feeds');

  await posterService.postFeed(feed.id, req.user?.id, req.ip || '');
  success(res, { posted: true, feedId: feed.feedId });
}

export async function pending(_req: Request, res: Response): Promise<void> {
  const data = await posterService.getPending();
  success(res, data);
}

export async function history(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await posterService.getHistory({
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function syncForumIndex(req: Request, res: Response): Promise<void> {
  const result = await posterService.syncForumIndex();
  success(res, result);
}
