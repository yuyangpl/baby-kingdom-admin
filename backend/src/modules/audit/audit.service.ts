import AuditLog from './audit.model.js';
import type { IAuditLog } from './audit.model.js';

interface AuditLogParams {
  operator?: string;
  eventType: string;
  module: IAuditLog['module'];
  targetId?: string;
  feedId?: string;
  bkUsername?: string;
  actionDetail?: string;
  before?: unknown;
  after?: unknown;
  apiStatus?: number;
  ip?: string;
  session?: IAuditLog['session'];
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
  return AuditLog.create({
    operator: operator || 'system',
    eventType,
    module,
    targetId,
    feedId,
    bkUsername,
    actionDetail,
    before,
    after,
    apiStatus,
    ip,
    session: session || 'admin',
  });
}

export async function list({ module, eventType, operator, page = 1, limit = 20, sort = '-createdAt' }: AuditListParams) {
  const filter: Record<string, string> = {};
  if (module) filter.module = module;
  if (eventType) filter.eventType = eventType;
  if (operator) filter.operator = operator;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
