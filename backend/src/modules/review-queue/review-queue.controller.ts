import { Request, Response } from 'express';
import * as service from './review-queue.service.js';
import { success } from '../../shared/response.js';

export async function claimBatch(req: Request, res: Response): Promise<void> {
  const { count } = req.body;
  const result = await service.claimBatch(req.user!.id, count || 10);
  success(res, result);
}

export async function getMyWorkbench(req: Request, res: Response): Promise<void> {
  const result = await service.myWorkbench(req.user!.id);
  success(res, result);
}

export async function publish(req: Request, res: Response): Promise<void> {
  const feed = await service.publish(req.params.id as string, req.user!.id, (req.ip ?? '') as string);
  success(res, feed);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { notes } = req.body;
  const feed = await service.reject(req.params.id as string, req.user!.id, notes, (req.ip ?? '') as string);
  success(res, feed);
}

export async function skip(req: Request, res: Response): Promise<void> {
  const feed = await service.skip(req.params.id as string, req.user!.id);
  success(res, feed);
}

export async function extendClaims(req: Request, res: Response): Promise<void> {
  const result = await service.extendClaims(req.user!.id);
  success(res, result);
}

export async function releaseClaims(req: Request, res: Response): Promise<void> {
  const result = await service.releaseClaims(req.user!.id);
  success(res, result);
}

export async function getMyStats(req: Request, res: Response): Promise<void> {
  const result = await service.myStats(req.user!.id);
  success(res, result);
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const mine = req.query.mine === 'true';
  const result = await service.stats(mine ? req.user!.id : undefined);
  success(res, result);
}
