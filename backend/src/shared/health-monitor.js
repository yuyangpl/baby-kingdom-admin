import jwt from 'jsonwebtoken';
import * as configService from '../modules/config/config.service.js';
import { getRedis } from './redis.js';
import { sendAlert } from './email.js';
import Feed from '../modules/feed/feed.model.js';
import logger from './logger.js';

const ALERT_TTL = 3 * 24 * 60 * 60; // 3 days in seconds

/**
 * Check BK Forum API connectivity.
 */
export async function checkBkForum() {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return { status: 'not_configured', detail: null };

  try {
    const res = await fetch(`${baseUrl}?mod=forum&op=index`, { signal: AbortSignal.timeout(5000) });
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: err.message };
  }
}

/**
 * Check MediaLens JWT token validity by decoding exp claim.
 */
export async function checkMediaLens() {
  const token = await configService.getValue('MEDIALENS_JWT_TOKEN');
  if (!token) return { status: 'not_configured', detail: null };

  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return { status: 'expired', detail: 'No exp claim in JWT' };

    const now = Math.floor(Date.now() / 1000);
    const remaining = decoded.exp - now;

    if (remaining <= 0) {
      return { status: 'expired', detail: 'Token has expired' };
    }

    const hours = Math.floor(remaining / 3600);
    const days = Math.floor(hours / 24);

    if (remaining <= 24 * 3600) {
      return { status: 'expiring_soon', detail: `expires in ${hours}h` };
    }

    return { status: 'valid', detail: `expires in ${days}d` };
  } catch {
    return { status: 'expired', detail: 'Failed to decode JWT' };
  }
}

/**
 * Check Gemini API: key configured + recent generation activity.
 */
export async function checkGemini() {
  const apiKey = await configService.getValue('GEMINI_API_KEY');
  if (!apiKey) return { status: 'not_configured', detail: null };

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFeed = await Feed.findOne({
    createdAt: { $gte: oneHourAgo },
    draftContent: { $ne: null },
    source: { $in: ['scanner', 'custom'] },
  }).sort({ createdAt: -1 }).lean();

  if (recentFeed) {
    const mins = Math.floor((Date.now() - new Date(recentFeed.createdAt).getTime()) / 60000);
    return { status: 'operational', detail: `last generation ${mins}m ago` };
  }

  return { status: 'no_recent_activity', detail: 'No generation in last 1h' };
}

/**
 * Check Google Trends API connectivity.
 */
export async function checkGoogleTrends() {
  const baseUrl = await configService.getValue('GOOGLE_TRENDS_BASE_URL');
  const enabled = await configService.getValue('GOOGLE_TRENDS_ENABLED');
  if (!baseUrl || enabled === 'false') return { status: 'not_configured', detail: null };

  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: err.message };
  }
}

/**
 * Run all 4 service checks and return results.
 */
export async function checkAllServices() {
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

// Statuses considered unhealthy (trigger alert)
const UNHEALTHY = new Set(['disconnected', 'expired', 'expiring_soon']);

/**
 * Check all services, send alerts for unhealthy ones, send recovery for restored ones.
 * Uses Redis keys with 3-day TTL: first alert immediately, no repeat for 3 days, then re-alert if still unhealthy.
 */
export async function runHealthCheck() {
  const results = await checkAllServices();
  const adminEmails = await configService.getValue('ADMIN_EMAILS');
  if (!adminEmails) {
    logger.warn('ADMIN_EMAILS not configured, skipping health alerts');
    return results;
  }

  const redis = getRedis();

  for (const [name, result] of Object.entries(results)) {
    const alertKey = `health:alert:${name}`;
    const isUnhealthy = UNHEALTHY.has(result.status);
    const alertSent = await redis.get(alertKey);

    if (isUnhealthy && !alertSent) {
      // First alert or 3-day TTL expired → send alert and set key
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
      await redis.set(alertKey, result.status, 'EX', ALERT_TTL);
      logger.info({ name, status: result.status }, 'Health alert sent');
    } else if (!isUnhealthy && alertSent) {
      // Service recovered → send recovery and delete key
      await sendAlert(
        adminEmails,
        `[BK Admin 恢复] ${name} 服务已恢复`,
        `<h3>服务恢复通知</h3>
        <p><b>服务:</b> ${name}</p>
        <p><b>状态:</b> ${result.status}</p>
        <p><b>恢复时间:</b> ${result.checkedAt}</p>`,
      );
      await redis.del(alertKey);
      logger.info({ name, status: result.status }, 'Health recovery sent');
    }
  }

  return results;
}
