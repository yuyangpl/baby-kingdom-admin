import { Request, Response } from 'express';
import * as queueService from './queue.service.js';
import { success } from '../../shared/response.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

export async function getAll(req: Request, res: Response): Promise<void> {
  const data = await queueService.getAllStatus();
  success(res, data);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const data = await queueService.getQueueStatus(req.params.name);
  if (!data) throw new NotFoundError('Queue');
  success(res, data);
}

export async function pause(req: Request, res: Response): Promise<void> {
  await queueService.pauseQueue(req.params.name, (req as any).user.id, req.ip);
  success(res, { paused: true });
}

export async function resume(req: Request, res: Response): Promise<void> {
  await queueService.resumeQueue(req.params.name, (req as any).user.id, req.ip);
  success(res, { resumed: true });
}

export async function trigger(req: Request, res: Response): Promise<void> {
  const result = await queueService.triggerQueue(req.params.name, (req as any).user.id, req.ip);
  if (!result) throw new NotFoundError('Queue');
  success(res, result);
}

export async function jobHistory(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await queueService.getJobHistory(req.params.name, {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function retryJob(req: Request, res: Response): Promise<void> {
  const ok = await queueService.retryJob(req.params.name, req.params.id, (req as any).user.id, req.ip);
  if (!ok) throw new NotFoundError('Job');
  success(res, { retried: true });
}
