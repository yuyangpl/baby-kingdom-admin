import { Request, Response } from 'express';
import * as scannerService from './scanner.service.js';
import { getQueue } from '../queue/queue.service.js';
import { success } from '../../shared/response.js';
import { BusinessError } from '../../shared/errors.js';

export async function trigger(req: Request, res: Response): Promise<void> {
  const q = getQueue('scanner');
  if (!q) throw new BusinessError('Scanner queue not initialized');
  const boards = await scannerService.getActiveBoards();
  if (boards.length === 0) throw new BusinessError('No active boards with scraping enabled');
  for (const board of boards) {
    await q.add(`manual-scan-${board.fid}`, { fid: board.fid, boardName: board.name, triggeredBy: 'manual' });
  }
  success(res, { queued: true, boards: boards.length, message: `${boards.length} board scan jobs queued` });
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
