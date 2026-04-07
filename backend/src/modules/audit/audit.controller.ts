import { Request, Response } from 'express';
import * as auditService from './audit.service.js';
import { success } from '../../shared/response.js';

export async function listAudits(req: Request, res: Response): Promise<void> {
  const { module, eventType, operator, page, limit, sort } = req.query;
  const result = await auditService.list({
    module: module as string | undefined,
    eventType: eventType as string | undefined,
    operator: operator as string | undefined,
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    sort: (sort as string) || '-createdAt',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}
