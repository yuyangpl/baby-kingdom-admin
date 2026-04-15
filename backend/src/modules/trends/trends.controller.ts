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

let refreshTokenAlertSent = false;

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { getValue, updateValue } = await import('../config/config.service.js');
  const { sendAlert } = await import('../../shared/email.js');
  const currentToken = await getValue('MEDIALENS_JWT_TOKEN');
  if (!currentToken) throw new Error('No MEDIALENS_JWT_TOKEN configured');

  const baseUrl = await getValue('MEDIALENS_BASE_URL') || 'https://medialens-skills-api-1012814233357.asia-east1.run.app/api/v1';
  try {
    const resp = await fetch(`${baseUrl}/auth/refresh-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      signal: AbortSignal.timeout(10000),
    });

    const respText = await resp.text();
    if (!resp.ok) throw new Error(`Refresh failed: ${resp.status} ${respText}`);
    let data: any;
    try { data = JSON.parse(respText); } catch { throw new Error(`Invalid JSON: ${respText.substring(0, 200)}`); }
    const newToken = data.token || data.data?.token || data.accessToken || data.data?.accessToken;
    if (!newToken) throw new Error(`No token in response: ${JSON.stringify(data).substring(0, 300)}`);

    const userId = (req as any).user?.id || 'system';
    const ip = req.ip || '';
    await updateValue('MEDIALENS_JWT_TOKEN', newToken, userId, ip);
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    await updateValue('MEDIALENS_JWT_TOKEN_EXPIRY', expiresAt, userId, ip);
    refreshTokenAlertSent = false;
    success(res, { refreshed: true, expiresAt });
  } catch (err: any) {
    // 仅发送一次邮件通知
    if (!refreshTokenAlertSent) {
      refreshTokenAlertSent = true;
      const adminEmails = await getValue('ADMIN_EMAILS');
      if (adminEmails) {
        for (const email of adminEmails.split(',').map((e: string) => e.trim()).filter(Boolean)) {
          const sent = await sendAlert(email,
            '[BK Admin] MediaLens Token 刷新失败',
            `<h3>MediaLens Token 刷新失败</h3><p>错误：${err.message}</p><p>时间：${new Date().toISOString()}</p><p>请登录后台重新获取 OTP 验证。</p>`
          );
          if (!sent) {
            // sendAlert 返回 false 表示发送失败，重置标记允许下次重试
            refreshTokenAlertSent = false;
          }
        }
      }
    }
    throw err;
  }
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
