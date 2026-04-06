import * as auditService from './audit.service.js';
import { success } from '../../shared/response.js';

export async function listAudits(req, res) {
  const { module, eventType, operator, page, limit, sort } = req.query;
  const result = await auditService.list({
    module,
    eventType,
    operator,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sort: sort || '-createdAt',
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}
