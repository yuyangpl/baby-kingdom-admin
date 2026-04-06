import * as scannerService from './scanner.service.js';
import { success } from '../../shared/response.js';

export async function trigger(req, res) {
  const stats = await scannerService.scanForumThreads();
  return success(res, stats);
}

export async function history(req, res) {
  const { page, limit } = req.query;
  const result = await scannerService.getHistory({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}
