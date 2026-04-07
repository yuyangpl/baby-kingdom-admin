import { Request, Response } from 'express';
import * as posterService from './poster.service.js';
import { success } from '../../shared/response.js';

export async function postFeed(req: Request, res: Response): Promise<void> {
  const feed = await posterService.postFeed(req.params.id as string, (req as any).user.id, req.ip ?? '');
  success(res, feed);
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
