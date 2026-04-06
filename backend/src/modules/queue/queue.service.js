import { Queue } from 'bullmq';
import { getRedis } from '../../shared/redis.js';
import QueueJob from './queue.model.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

const queues = {};

const QUEUE_NAMES = ['scanner', 'trends', 'poster', 'daily-reset', 'stats-aggregator', 'ml-token-refresh'];

export function initQueues() {
  const connection = getRedis();
  for (const name of QUEUE_NAMES) {
    queues[name] = new Queue(name, { connection });
  }
  logger.info(`Initialized ${QUEUE_NAMES.length} BullMQ queues`);
}

export function getQueue(name) {
  return queues[name];
}

export async function getAllStatus() {
  const result = [];
  for (const name of QUEUE_NAMES) {
    const q = queues[name];
    if (!q) {
      result.push({ name, status: 'not_initialized', counts: {} });
      continue;
    }

    try {
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'paused');
      const isPaused = await q.isPaused();
      result.push({ name, status: isPaused ? 'paused' : 'running', counts });
    } catch {
      result.push({ name, status: 'error', counts: {} });
    }
  }
  return result;
}

export async function getQueueStatus(name) {
  const q = queues[name];
  if (!q) return null;

  const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'paused');
  const isPaused = await q.isPaused();
  return { name, status: isPaused ? 'paused' : 'running', counts };
}

export async function pauseQueue(name, userId, ip) {
  const q = queues[name];
  if (!q) return false;
  await q.pause();
  await auditService.log({
    operator: userId, eventType: 'QUEUE_PAUSED', module: 'queue',
    targetId: name, actionDetail: `Paused queue: ${name}`, ip,
  });
  return true;
}

export async function resumeQueue(name, userId, ip) {
  const q = queues[name];
  if (!q) return false;
  await q.resume();
  await auditService.log({
    operator: userId, eventType: 'QUEUE_RESUMED', module: 'queue',
    targetId: name, actionDetail: `Resumed queue: ${name}`, ip,
  });
  return true;
}

export async function triggerQueue(name, userId, ip) {
  const q = queues[name];
  if (!q) return null;
  const job = await q.add(`manual-${name}`, { triggeredBy: 'manual', triggeredByUser: userId });

  await auditService.log({
    operator: userId, eventType: 'QUEUE_RESUMED', module: 'queue',
    targetId: name, actionDetail: `Manual trigger queue: ${name}`, ip,
  });

  return { jobId: job.id, queueName: name };
}

export async function getJobHistory(name, { page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const filter = { queueName: name };
  const [data, total] = await Promise.all([
    QueueJob.find(filter).sort('-createdAt').skip(skip).limit(limit),
    QueueJob.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function retryJob(name, jobId, userId, ip) {
  const q = queues[name];
  if (!q) return false;

  const job = await q.getJob(jobId);
  if (!job) return false;

  await job.retry();
  await auditService.log({
    operator: userId, eventType: 'QUEUE_RESUMED', module: 'queue',
    targetId: `${name}:${jobId}`, actionDetail: `Retried job ${jobId} in queue ${name}`, ip,
  });
  return true;
}

// Record job execution in MongoDB for history
export async function recordJob(queueName, { jobId, status, startedAt, completedAt, result, error, triggeredBy, triggeredByUser }) {
  return QueueJob.create({
    queueName, jobId, status, startedAt, completedAt,
    duration: completedAt && startedAt ? completedAt.getTime() - startedAt.getTime() : null,
    result, error, triggeredBy, triggeredByUser,
  });
}
