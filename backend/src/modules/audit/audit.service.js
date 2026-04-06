import AuditLog from './audit.model.js';

export async function log({ operator, eventType, module, targetId, feedId, bkUsername, actionDetail, before, after, apiStatus, ip, session }) {
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

export async function list({ module, eventType, operator, page = 1, limit = 20, sort = '-createdAt' }) {
  const filter = {};
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
