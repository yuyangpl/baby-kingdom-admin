import { Request, Response } from 'express';
import * as feedService from './feed.service.js';
import { success } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { status, source, threadFid, personaId, page, limit, sort } = req.query;
  const result = await feedService.list({
    status, source, threadFid, personaId,
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    sort: (sort as string) || '-createdAt',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const feed = await feedService.getById(req.params.id);
  success(res, feed);
}

export async function claim(req: Request, res: Response): Promise<void> {
  const feed = await feedService.claim(req.params.id, (req as any).user.id);
  success(res, feed);
}

export async function unclaim(req: Request, res: Response): Promise<void> {
  const feed = await feedService.unclaim(req.params.id, (req as any).user.id);
  success(res, feed);
}

export async function approve(req: Request, res: Response): Promise<void> {
  const feed = await feedService.approve(req.params.id, (req as any).user.id, req.ip);
  success(res, feed);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { notes } = req.body;
  const feed = await feedService.reject(req.params.id, (req as any).user.id, notes, req.ip);
  success(res, feed);
}

export async function updateContent(req: Request, res: Response): Promise<void> {
  const { content } = req.body;
  if (!content) throw new ValidationError('Content is required');
  const feed = await feedService.updateContent(req.params.id, content, (req as any).user.id, req.ip);
  success(res, feed);
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  const { toneMode, personaAccountId } = req.body;
  const feed = await feedService.regenerate(req.params.id, { toneMode, personaAccountId }, (req as any).user.id, req.ip);
  success(res, feed);
}

export async function customGenerate(req: Request, res: Response): Promise<void> {
  const { topic, personaAccountId, toneMode, postType, targetFid } = req.body;
  if (!topic) throw new ValidationError('Topic is required');
  const feed = await feedService.customGenerate({ topic, personaAccountId, toneMode, postType, targetFid }, (req as any).user.id, req.ip);
  success(res, feed);
}

export async function batchApprove(req: Request, res: Response): Promise<void> {
  const { feedIds } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch approve more than 50 feeds at once');
  const result = await feedService.batchApprove(feedIds, (req as any).user.id, req.ip);
  success(res, result);
}

export async function batchReject(req: Request, res: Response): Promise<void> {
  const { feedIds, notes } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch reject more than 50 feeds at once');
  const result = await feedService.batchReject(feedIds, (req as any).user.id, notes, req.ip);
  success(res, result);
}
