import { Request, Response } from 'express';
import * as scannerService from './scanner.service.js';
import { success } from '../../shared/response.js';

export async function trigger(req: Request, res: Response): Promise<void> {
  const stats = await scannerService.scanForumThreads();
  success(res, stats);
}

export async function history(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await scannerService.getHistory({
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}
