import * as posterService from './poster.service.js';
import { success } from '../../shared/response.js';

export async function postFeed(req, res) {
  const feed = await posterService.postFeed(req.params.id, req.user.id, req.ip);
  return success(res, feed);
}

export async function history(req, res) {
  const { page, limit } = req.query;
  const result = await posterService.getHistory({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}
