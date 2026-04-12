import { getPrisma } from '../../shared/database.js';

export async function logTask(taskName: string, params: {
  status: string;
  duration?: number;
  result?: unknown;
  error?: string;
  triggeredBy?: string;
}) {
  const prisma = getPrisma();
  return prisma.taskLog.create({
    data: {
      taskName,
      status: params.status,
      duration: params.duration,
      result: params.result !== undefined ? (params.result as any) : undefined,
      error: params.error,
      triggeredBy: params.triggeredBy || 'cron',
    },
  });
}

export async function getTaskLogs(taskName: string, { page = 1, limit = 20 }: { page?: number; limit?: number }) {
  const prisma = getPrisma();
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.taskLog.findMany({
      where: { taskName },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.taskLog.count({ where: { taskName } }),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getLatestTaskLog(taskName: string) {
  const prisma = getPrisma();
  return prisma.taskLog.findFirst({
    where: { taskName },
    orderBy: { createdAt: 'desc' },
  });
}
