import * as trendsService from './trends.service.js';
import { success } from '../../shared/response.js';

export async function list(req, res) {
  const { source, page, limit, sort } = req.query;
  const result = await trendsService.list({
    source,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sort: sort || '-createdAt',
  });
  return res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function trigger(req, res) {
  const trends = await trendsService.pullTrends();
  return success(res, { pulled: trends.length });
}

export async function requestOtp(req, res) {
  const ok = await trendsService.requestOtp();
  return success(res, { sent: ok });
}

export async function verifyOtp(req, res) {
  const { otp } = req.body;
  const ok = await trendsService.verifyOtp(otp);
  return success(res, { verified: ok });
}

export async function tokenStatus(req, res) {
  // Just check if the token exists and report status
  const { default: Config } = await import('../config/config.model.js');
  const tokenConfig = await Config.findOne({ key: 'MEDIALENS_JWT_TOKEN' });
  return success(res, {
    hasToken: !!(tokenConfig?.value),
    updatedAt: tokenConfig?.updatedAt,
  });
}
