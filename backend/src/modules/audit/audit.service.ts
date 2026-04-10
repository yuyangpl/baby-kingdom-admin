import { getPrisma } from '../../shared/database.js';

interface AuditLogParams {
  operator?: string;
  eventType: string;
  module: string;
  targetId?: string;
  feedId?: string;
  bkUsername?: string;
  actionDetail?: string;
  before?: unknown;
  after?: unknown;
  apiStatus?: number;
  ip?: string;
  session?: string;
}

interface AuditListParams {
  module?: string;
  eventType?: string;
  operator?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export async function log({ operator, eventType, module, targetId, feedId, bkUsername, actionDetail, before, after, apiStatus, ip, session }: AuditLogParams) {
  const prisma = getPrisma();
  return prisma.auditLog.create({
    data: {
      operator: operator || 'system',
      eventType,
      module,
      targetId: targetId || undefined,
      feedId: feedId || undefined,
      bkUsername: bkUsername || undefined,
      actionDetail: actionDetail || undefined,
      before: before ? JSON.parse(JSON.stringify(before)) : undefined,
      after: after ? JSON.parse(JSON.stringify(after)) : undefined,
      apiStatus: apiStatus || undefined,
      ip: ip || undefined,
      session: session || 'admin',
    },
  });
}

export async function list({ module, eventType, operator, page = 1, limit = 20, sort = '-createdAt' }: AuditListParams) {
  const prisma = getPrisma();
  const where: Record<string, string> = {};
  if (module) where.module = module;
  if (eventType) where.eventType = eventType;
  if (operator) where.operator = operator;

  const skip = (page - 1) * limit;

  // Parse sort string: '-createdAt' → { createdAt: 'desc' }
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const orderBy = { [field]: desc ? 'desc' as const : 'asc' as const };

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy, skip, take: limit }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Cleanup audit logs older than 90 days (replaces MongoDB TTL index).
 */
export async function cleanupOldLogs() {
  const prisma = getPrisma();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
