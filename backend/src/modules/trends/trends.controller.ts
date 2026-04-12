import { Request, Response } from 'express';
import * as trendsService from './trends.service.js';
import { success } from '../../shared/response.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { source, page, limit, sort } = req.query;
  const result = await trendsService.list({
    source: source as string | undefined,
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    sort: (sort as string) || '-createdAt',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function trigger(req: Request, res: Response): Promise<void> {
  const result = await trendsService.pullTrends();
  const trends = result.trends ?? result;
  const feedsGenerated = result.feedsGenerated ?? 0;
  success(res, { pulled: Array.isArray(trends) ? trends.length : 0, feedsGenerated });
}

export async function requestOtp(req: Request, res: Response): Promise<void> {
  const ok = await trendsService.requestOtp();
  success(res, { sent: ok });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { otp } = req.body;
  const ok = await trendsService.verifyOtp(otp);
  success(res, { verified: ok });
}

export async function tokenStatus(req: Request, res: Response): Promise<void> {
  const { getValue } = await import('../config/config.service.js');
  const tokenValue = await getValue('MEDIALENS_JWT_TOKEN');
  const expiresAt = await getValue('MEDIALENS_JWT_TOKEN_EXPIRY');
  const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : true;
  success(res, {
    hasToken: !!tokenValue && !isExpired,
    expiresAt,
  });
}
