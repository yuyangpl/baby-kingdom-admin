import * as queueService from './queue.service.js';
import { success } from '../../shared/response.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

export async function getAll(req, res) {
  const data = await queueService.getAllStatus();
  return success(res, data);
}

export async function getOne(req, res) {
  const data = await queueService.getQueueStatus(req.params.name);
  if (!data) throw new NotFoundError('Queue');
  return success(res, data);
}

export async function pause(req, res) {
  await queueService.pauseQueue(req.params.name, req.user.id, req.ip);
  return success(res, { paused: true });
}

export async function resume(req, res) {
  await queueService.resumeQueue(req.params.name, req.user.id, req.ip);
  return success(res, { resumed: true });
}

export async function trigger(req, res) {
  const result = await queueService.triggerQueue(req.params.name, req.user.id, req.ip);
  if (!result) throw new NotFoundError('Queue');
  return success(res, result);
}

export async function jobHistory(req, res) {
  const { page, limit } = req.query;
  const result = await queueService.getJobHistory(req.params.name, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function retryJob(req, res) {
  const ok = await queueService.retryJob(req.params.name, req.params.id, req.user.id, req.ip);
  if (!ok) throw new NotFoundError('Job');
  return success(res, { retried: true });
}
