import { Request, Response } from 'express';
import * as scannerService from './scanner.service.js';
import { success } from '../../shared/response.js';
import { BusinessError } from '../../shared/errors.js';
import logger from '../../shared/logger.js';

export async function trigger(req: Request, res: Response): Promise<void> {
  const boards = await scannerService.getActiveBoards();
  if (boards.length === 0) throw new BusinessError('No active boards with scraping enabled');
  const port = process.env.PORT || 8080;
  for (const board of boards) {
    fetch(`http://localhost:${port}/tasks/scanner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fid: board.fid, triggeredBy: 'manual' }),
      signal: AbortSignal.timeout(30000),
    }).catch(err => logger.warn({ err }, 'Scanner task dispatch failed'));
  }
  success(res, { queued: true, boards: boards.length, message: `${boards.length} board scan jobs dispatched` });
}

export async function history(req: Request, res: Response): Promise<void> {
  const { page, limit, from, to } = req.query;
  const result = await scannerService.getHistory({
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    from: from as string,
    to: to as string,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}
