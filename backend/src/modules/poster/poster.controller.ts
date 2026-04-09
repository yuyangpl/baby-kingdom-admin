import { Request, Response } from 'express';
import * as posterService from './poster.service.js';
import { getQueue } from '../queue/queue.service.js';
import { success } from '../../shared/response.js';
import { BusinessError } from '../../shared/errors.js';

export async function postFeed(req: Request, res: Response): Promise<void> {
  const q = getQueue('poster');
  if (!q) throw new BusinessError('Poster queue not initialized');
  const Feed = (await import('../feed/feed.model.js')).default;
  const feed = await Feed.findById(req.params.id);
  if (!feed) throw new BusinessError('Feed not found');
  if (feed.status !== 'approved') throw new BusinessError('Can only post approved feeds');

  await q.add(`manual-post-${feed.feedId}`, {
    feedId: feed._id.toString(),
    feedIdShort: feed.feedId,
    personaId: feed.personaId,
    boardFid: feed.threadFid,
    postType: feed.postType,
    triggeredBy: 'manual',
  });

  success(res, { queued: true, feedId: feed.feedId });
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
