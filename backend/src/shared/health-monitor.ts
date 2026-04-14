import * as configService from '../modules/config/config.service.js';
import { sendAlert } from './email.js';
import { getPrisma } from './database.js';
import logger from './logger.js';

const ALERT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

// In-memory alert cache (replaces Redis keys)
// Key: service name, Value: { status, sentAt }
const alertCache = new Map<string, { status: string; sentAt: number }>();

interface ServiceCheckResult {
  status: string;
  detail: string | null;
  checkedAt?: string;
}

export async function checkBkForum(): Promise<ServiceCheckResult> {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return { status: 'not_configured', detail: null };

  try {
    const res = await fetch(`${baseUrl}?mod=forum&op=index`, { signal: AbortSignal.timeout(5000) });
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: (err as Error).message };
  }
}

export async function checkMediaLens(): Promise<ServiceCheckResult> {
  const token = await configService.getValue('MEDIALENS_JWT_TOKEN');
  if (!token) return { status: 'not_configured', detail: null };

  const expiryStr = await configService.getValue('MEDIALENS_JWT_TOKEN_EXPIRY');
  if (!expiryStr) return { status: 'expired', detail: 'No expiry set' };

  const expiryMs = new Date(expiryStr).getTime();
  const remaining = expiryMs - Date.now();

  if (remaining <= 0) {
    return { status: 'expired', detail: 'Token has expired' };
  }

  const hours = Math.floor(remaining / 3600000);
  const days = Math.floor(hours / 24);

  if (remaining <= 24 * 3600 * 1000) {
    return { status: 'expiring_soon', detail: `expires in ${hours}h` };
  }

  return { status: 'valid', detail: `expires in ${days}d ${hours % 24}h` };
}

export async function checkGemini(): Promise<ServiceCheckResult> {
  const apiKey = await configService.getValue('GEMINI_API_KEY');
  if (!apiKey) return { status: 'not_configured', detail: null };

  const prisma = getPrisma();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFeed = await prisma.feed.findFirst({
    where: {
      createdAt: { gte: oneHourAgo },
      draftContent: { not: null },
      source: { hasSome: ['scanner', 'custom'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentFeed) {
    const mins = Math.floor((Date.now() - new Date(recentFeed.createdAt).getTime()) / 60000);
    return { status: 'operational', detail: `last generation ${mins}m ago` };
  }

  return { status: 'no_recent_activity', detail: 'No generation in last 1h' };
}

export async function checkGoogleTrends(): Promise<ServiceCheckResult> {
  const baseUrl = await configService.getValue('GOOGLE_TRENDS_BASE_URL');
  const apiKey = await configService.getValue('GOOGLE_TRENDS_API_KEY');
  const enabled = await configService.getValue('GOOGLE_TRENDS_ENABLED');
  if (!baseUrl || enabled === 'false') return { status: 'not_configured', detail: null };
  if (!apiKey) return { status: 'not_configured', detail: 'API key missing' };

  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${baseUrl}/trends?geo=HK&start_date=${today}&end_date=${today}&limit=1`,
      { headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(5000) },
    );
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: (err as Error).message };
  }
}

interface AllServicesResult {
  bkForum: ServiceCheckResult;
  mediaLens: ServiceCheckResult;
  gemini: ServiceCheckResult;
  googleTrends: ServiceCheckResult;
}

export async function checkAllServices(): Promise<AllServicesResult> {
  const now = new Date().toISOString();
  const [bkForum, mediaLens, gemini, googleTrends] = await Promise.all([
    checkBkForum(),
    checkMediaLens(),
    checkGemini(),
    checkGoogleTrends(),
  ]);

  return {
    bkForum: { ...bkForum, checkedAt: now },
    mediaLens: { ...mediaLens, checkedAt: now },
    gemini: { ...gemini, checkedAt: now },
    googleTrends: { ...googleTrends, checkedAt: now },
  };
}

const UNHEALTHY = new Set(['disconnected', 'expired', 'expiring_soon']);

export async function runHealthCheck(): Promise<AllServicesResult> {
  const results = await checkAllServices();
  const adminEmails = await configService.getValue('ADMIN_EMAILS');
  if (!adminEmails) {
    logger.warn('ADMIN_EMAILS not configured, skipping health alerts');
    return results;
  }

  for (const [name, result] of Object.entries(results)) {
    const isUnhealthy = UNHEALTHY.has(result.status);
    const cached = alertCache.get(name);
    const alertExpired = !cached || (Date.now() - cached.sentAt) > ALERT_TTL_MS;

    if (isUnhealthy && (!cached || alertExpired)) {
      await sendAlert(
        adminEmails,
        `[BK Admin 告警] ${name} 服务异常`,
        `<h3>服务异常告警</h3>
        <p><b>服务:</b> ${name}</p>
        <p><b>状态:</b> ${result.status}</p>
        <p><b>详情:</b> ${result.detail || '无'}</p>
        <p><b>检测时间:</b> ${result.checkedAt}</p>
        <p>请及时处理。如 3 天内未修复将再次提醒。</p>`,
      );
      alertCache.set(name, { status: result.status, sentAt: Date.now() });
      logger.info({ name, status: result.status }, 'Health alert sent');
    } else if (!isUnhealthy && cached) {
      await sendAlert(
        adminEmails,
        `[BK Admin 恢复] ${name} 服务已恢复`,
        `<h3>服务恢复通知</h3>
        <p><b>服务:</b> ${name}</p>
        <p><b>状态:</b> ${result.status}</p>
        <p><b>恢复时间:</b> ${result.checkedAt}</p>`,
      );
      alertCache.delete(name);
      logger.info({ name, status: result.status }, 'Health recovery sent');
    }
  }

  return results;
}

// Track which preflight alerts have been sent (only once per failure combination)
const preflightAlertSent = new Set<string>();

/**
 * Pre-check Gemini and BK Forum before feed generation.
 * Returns failure reasons (empty = all OK). Sends email alert once per failure.
 */
export async function preflight(): Promise<string[]> {
  const failures: string[] = [];

  const [gemini, bkForum] = await Promise.all([checkGemini(), checkBkForum()]);

  if (gemini.status === 'not_configured') {
    failures.push('Gemini API Key 未配置');
  }

  if (bkForum.status === 'disconnected' || bkForum.status === 'not_configured') {
    failures.push(`BK Forum 連接失敗: ${bkForum.detail || bkForum.status}`);
  }

  if (failures.length > 0) {
    const alertKey = failures.join('|');
    if (!preflightAlertSent.has(alertKey)) {
      const adminEmails = await configService.getValue('ADMIN_EMAILS');
      if (adminEmails) {
        await sendAlert(
          adminEmails,
          '[BK Admin 告警] Feed 生成已暫停 — 服務連接失敗',
          `<h3>Feed 生成前置檢查失敗</h3>
          <ul>${failures.map(f => `<li>${f}</li>`).join('')}</ul>
          <p>Feed 生成任務已自動跳過，直到問題修復。</p>
          <p><b>時間:</b> ${new Date().toISOString()}</p>`,
        );
        preflightAlertSent.add(alertKey);
        logger.warn({ failures }, 'Preflight failed, alert email sent');
      }
    }
  } else {
    if (preflightAlertSent.size > 0) preflightAlertSent.clear();
  }

  return failures;
}
