import { Request, Response } from 'express';
import * as scannerService from './scanner.service.js';
import { addToQueue } from '../queue/queue.service.js';
import { success } from '../../shared/response.js';
import { BusinessError } from '../../shared/errors.js';

export async function trigger(req: Request, res: Response): Promise<void> {
  const boards = await scannerService.getActiveBoards();
  if (boards.length === 0) throw new BusinessError('No active boards with scraping enabled');
  for (const board of boards) {
    await addToQueue('scanner', { fid: board.fid, boardName: board.name, triggeredBy: 'manual' });
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
