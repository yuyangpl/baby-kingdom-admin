import * as feedService from './feed.service.js';
import { success } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function list(req, res) {
  const { status, source, threadFid, personaId, page, limit, sort } = req.query;
  const result = await feedService.list({
    status, source, threadFid, personaId,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sort: sort || '-createdAt',
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getById(req, res) {
  const feed = await feedService.getById(req.params.id);
  return success(res, feed);
}

export async function claim(req, res) {
  const feed = await feedService.claim(req.params.id, req.user.id);
  return success(res, feed);
}

export async function unclaim(req, res) {
  const feed = await feedService.unclaim(req.params.id, req.user.id);
  return success(res, feed);
}

export async function approve(req, res) {
  const feed = await feedService.approve(req.params.id, req.user.id, req.ip);
  return success(res, feed);
}

export async function reject(req, res) {
  const { notes } = req.body;
  const feed = await feedService.reject(req.params.id, req.user.id, notes, req.ip);
  return success(res, feed);
}

export async function updateContent(req, res) {
  const { content } = req.body;
  if (!content) throw new ValidationError('Content is required');
  const feed = await feedService.updateContent(req.params.id, content, req.user.id, req.ip);
  return success(res, feed);
}

export async function regenerate(req, res) {
  const { toneMode, personaAccountId } = req.body;
  const feed = await feedService.regenerate(req.params.id, { toneMode, personaAccountId }, req.user.id, req.ip);
  return success(res, feed);
}

export async function customGenerate(req, res) {
  const { topic, personaAccountId, toneMode, postType, targetFid } = req.body;
  if (!topic) throw new ValidationError('Topic is required');
  const feed = await feedService.customGenerate({ topic, personaAccountId, toneMode, postType, targetFid }, req.user.id, req.ip);
  return success(res, feed);
}

export async function batchApprove(req, res) {
  const { feedIds } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch approve more than 50 feeds at once');
  const result = await feedService.batchApprove(feedIds, req.user.id, req.ip);
  return success(res, result);
}

export async function batchReject(req, res) {
  const { feedIds, notes } = req.body;
  if (!Array.isArray(feedIds) || feedIds.length === 0) throw new ValidationError('feedIds array is required');
  if (feedIds.length > 50) throw new ValidationError('Cannot batch reject more than 50 feeds at once');
  const result = await feedService.batchReject(feedIds, req.user.id, notes, req.ip);
  return success(res, result);
}
