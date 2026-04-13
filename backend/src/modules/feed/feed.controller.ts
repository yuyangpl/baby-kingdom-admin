import { Request, Response } from 'express';
import * as feedService from './feed.service.js';
import { success } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { status, source, threadFid, personaId, page, limit, sort } = req.query;
  const user = (req as any).user;
  const result = await feedService.list({
    status: status as string | undefined,
    source: source as string | undefined,
    threadFid: threadFid as string | number | undefined,
    personaId: personaId as string | undefined,
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    sort: (sort as string) || '-createdAt',
    userId: user?.id,
    userRole: user?.role,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const feed = await feedService.getById(req.params.id as string);
  success(res, feed);
}

export async function approve(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const feed = await feedService.approve(req.params.id as string, user.id, user.role, req.ip ?? '');
  success(res, feed);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { notes } = req.body;
  const feed = await feedService.reject(req.params.id as string, user.id, user.role, notes, req.ip ?? '');
  success(res, feed);
}

export async function updateContent(req: Request, res: Response): Promise<void> {
  const { content, toneMode, personaId, adminNotes } = req.body;
  if (!content) throw new ValidationError('Content is required');
  const feed = await feedService.updateContent(req.params.id as string, { content, toneMode, personaId, adminNotes }, (req as any).user.id, req.ip ?? '');
  success(res, feed);
}

export async function assign(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;
  if (!userId) throw new ValidationError('userId is required');
  const feed = await feedService.assignFeed(req.params.id as string, userId, (req as any).user.id, req.ip ?? '');
  success(res, feed);
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  const { toneMode, personaAccountId } = req.body;
  const feed = await feedService.regenerate(req.params.id as string, { toneMode, personaAccountId }, (req as any).user.id, req.ip ?? '');
  success(res, feed);
}

export async function customGenerate(req: Request, res: Response): Promise<void> {
  const { topic, personaAccountId, toneMode, postType, targetFid } = req.body;
  if (!topic) throw new ValidationError('Topic is required');
  const feed = await feedService.customGenerate({ topic, personaAccountId, toneMode, postType, targetFid }, (req as any).user.id, req.ip ?? '');
  success(res, feed);
}

export async function batchApprove(req: Request, res: Response): Promise<void> {
  const { feedIds } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch approve more than 50 feeds at once');
  const user = (req as any).user;
  const result = await feedService.batchApprove(feedIds, user.id, req.ip ?? '');
  success(res, result);
}

export async function batchReject(req: Request, res: Response): Promise<void> {
  const { feedIds, notes } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch reject more than 50 feeds at once');
  const user = (req as any).user;
  const result = await feedService.batchReject(feedIds, user.id, notes, req.ip ?? '');
  success(res, result);
}
