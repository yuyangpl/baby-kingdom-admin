import { getPrisma } from '../../shared/database.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

const QUEUE_NAMES = ['scanner', 'trends', 'poster', 'daily-reset', 'stats-aggregator', 'google-trends'] as const;

export function initQueues(): void {
  logger.info(`Queue service ready (${QUEUE_NAMES.length} queues, DB-backed)`);
}


export interface QueueStatusItem {
  name: string;
  status: string;
  counts: Record<string, number> | object;
}

export async function getAllStatus(): Promise<QueueStatusItem[]> {
  const prisma = getPrisma();
  const result: QueueStatusItem[] = [];

  for (const name of QUEUE_NAMES) {
    try {
      const latest = await prisma.queueJob.findFirst({
        where: { queueName: name },
        orderBy: { createdAt: 'desc' },
      });

      if (!latest) {
        result.push({ name, status: 'idle', counts: {} });
        continue;
      }

      // Aggregate counts by status for this queue
      const statusCounts = await prisma.queueJob.groupBy({
        by: ['status'],
        where: { queueName: name },
        _count: true,
      });

      const counts: Record<string, number> = {};
      for (const row of statusCounts) {
        counts[row.status] = row._count;
      }

      const status = latest.status === 'active' ? 'running' : latest.status === 'failed' ? 'error' : 'idle';
      result.push({ name, status, counts });
    } catch {
      result.push({ name, status: 'error', counts: {} });
    }
  }
  return result;
}

export async function getQueueStatus(name: string) {
  const prisma = getPrisma();

  const latest = await prisma.queueJob.findFirst({
    where: { queueName: name },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) return { name, status: 'idle', counts: {} };

  const statusCounts = await prisma.queueJob.groupBy({
    by: ['status'],
    where: { queueName: name },
    _count: true,
  });

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row._count;
  }

  const status = latest.status === 'active' ? 'running' : latest.status === 'failed' ? 'error' : 'idle';
  return { name, status, counts };
}

// Stub: actual pause will use Cloud Tasks queue pause or config flag in Phase 2
export async function pauseQueue(name: string, userId: string, ip: string) {
  logger.info({ queue: name }, 'pauseQueue stub called — Cloud Tasks pause pending Phase 2');
  await auditService.log({
    operator: userId, eventType: 'QUEUE_PAUSED', module: 'queue',
    targetId: name, actionDetail: `Paused queue: ${name} (stub)`, ip,
  });
  return true;
}

// Stub: actual resume will use Cloud Tasks in Phase 2
export async function resumeQueue(name: string, userId: string, ip: string) {
  logger.info({ queue: name }, 'resumeQueue stub called — Cloud Tasks resume pending Phase 2');
  await auditService.log({
    operator: userId, eventType: 'QUEUE_RESUMED', module: 'queue',
    targetId: name, actionDetail: `Resumed queue: ${name} (stub)`, ip,
  });
  return true;
}

export async function triggerQueue(name: string, userId: string, ip: string) {
  const prisma = getPrisma();

  const job = await prisma.queueJob.create({
    data: {
      queueName: name,
      jobId: `manual-${name}-${Date.now()}`,
      status: 'waiting',
      triggeredBy: 'manual',
      triggeredByUser: userId,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'QUEUE_TRIGGERED', module: 'queue',
    targetId: name, actionDetail: `Manual trigger queue: ${name}`, ip,
  });

  // Dispatch task locally (same process)
  const taskEndpoints: Record<string, string> = {
    scanner: '/tasks/scanner',
    trends: '/tasks/trends',
    poster: '/tasks/poster',
    'google-trends': '/tasks/gtrends',
  };
  const endpoint = taskEndpoints[name];
  if (endpoint) {
    const port = process.env.PORT || 3000;
    fetch(`http://localhost:${port}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'manual', triggeredByUser: userId }),
      signal: AbortSignal.timeout(30000),
    }).catch(err => logger.warn({ err, name }, 'Local task dispatch failed'));
  }

  return { jobId: job.id, queueName: name };
}

export async function getAllJobs({ page = 1, limit = 20 }: { page?: number; limit?: number }) {
  const prisma = getPrisma();
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.queueJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.queueJob.count(),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

// Was BullMQ-specific (in-memory waiting jobs). Returns empty for now.
export async function getWaitingJobs(_name: string) {
  return [];
}

export async function getJobHistory(name: string, { page = 1, limit = 20 }: { page?: number; limit?: number }) {
  const prisma = getPrisma();
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.queueJob.findMany({
      where: { queueName: name },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.queueJob.count({ where: { queueName: name } }),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

// Stub: BullMQ retry not applicable. Cloud Tasks retry will be wired in Phase 2.
export async function retryJob(name: string, jobId: string, userId: string, ip: string) {
  logger.info({ queue: name, jobId }, 'retryJob stub called — Cloud Tasks retry pending Phase 2');
  await auditService.log({
    operator: userId, eventType: 'QUEUE_RESUMED', module: 'queue',
    targetId: `${name}:${jobId}`, actionDetail: `Retried job ${jobId} in queue ${name} (stub)`, ip,
  });
  return true;
}

export async function removeJob(name: string, jobId: string, userId: string, ip: string): Promise<boolean> {
  const prisma = getPrisma();

  await prisma.queueJob.deleteMany({
    where: { queueName: name, jobId },
  });

  await auditService.log({
    operator: userId, eventType: 'QUEUE_JOB_REMOVED', module: 'queue',
    targetId: `${name}:${jobId}`, actionDetail: `Removed job ${jobId} from queue ${name}`, ip,
  });
  return true;
}

interface RecordJobParams {
  jobId?: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  triggeredBy: string;
  triggeredByUser?: string;
}

// Record job execution in DB for history
export async function recordJob(queueName: string, { jobId, status, startedAt, completedAt, result, error, triggeredBy, triggeredByUser }: RecordJobParams) {
  const prisma = getPrisma();

  return prisma.queueJob.create({
    data: {
      queueName,
      jobId,
      status,
      startedAt,
      completedAt,
      duration: completedAt && startedAt ? completedAt.getTime() - startedAt.getTime() : null,
      result: result !== undefined ? (result as any) : undefined,
      error,
      triggeredBy,
      triggeredByUser,
    },
  });
}

/**
 * Add a job to the queue. Creates a QueueJob record with status 'waiting'.
 * Used by other services (e.g., feed.service.ts calls addToQueue('poster', data) after approval).
 * In Phase 2, this will also dispatch a Cloud Tasks request.
 */
export async function addToQueue(queueName: string, data: any): Promise<{ id: string; queueName: string }> {
  const prisma = getPrisma();

  const job = await prisma.queueJob.create({
    data: {
      queueName,
      jobId: `${queueName}-${Date.now()}`,
      status: 'waiting',
      result: data ?? undefined,
      triggeredBy: 'manual',
    },
  });

  logger.info({ queueName, jobId: job.id }, 'Job added to queue and dispatched');
  return { id: job.id, queueName };
}
