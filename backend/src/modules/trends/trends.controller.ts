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
  const trends = await trendsService.pullTrends();
  success(res, { pulled: trends.length });
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
  // Just check if the token exists and report status
  const { default: Config } = await import('../config/config.model.js');
  const tokenConfig = await Config.findOne({ key: 'MEDIALENS_JWT_TOKEN' });
  success(res, {
    hasToken: !!(tokenConfig?.value),
    updatedAt: tokenConfig?.updatedAt,
  });
}
