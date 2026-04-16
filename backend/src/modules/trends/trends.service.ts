import { getPrisma } from '../../shared/database.js';
import * as configService from '../config/config.service.js';
import { autoAssignTier } from '../gemini/prompt.builder.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

interface RawTrend {
  // viral-topics (medialens)
  topic_label?: string;
  topic?: string;
  summary?: string;
  description?: string;
  engagements?: number;
  engagement?: number;
  post_count?: number;
  posts?: number;
  sentiment_score?: number;
  sentiment?: number;
  rank?: number;
  // lihkg
  title?: string;
  category?: string;
  replies?: number;
  total_engagement?: number;
  lihkg_url?: string;
  // facebook
  message_preview?: string;
  facebook_url?: string;
  posted_by?: string;
  [key: string]: any;
}

/**
 * Pull trends from MediaLens API.
 * Returns pulled trends array.
 */
export async function pullTrends(): Promise<{ trends: any[]; feedsGenerated: number }> {
  const baseUrl = await configService.getValue('MEDIALENS_BASE_URL');
  const jwtToken = await configService.getValue('MEDIALENS_JWT_TOKEN');
  const country = await configService.getValue('MEDIALENS_COUNTRY') || 'HK';
  const limit = parseInt(await configService.getValue('FEEDS_PER_TREND_PULL') || '5', 10);
  const lookbackDays = parseInt(await configService.getValue('TREND_LOOKBACK_DAYS') || '1', 10);

  if (!baseUrl || !jwtToken) {
    logger.warn('MediaLens not configured, skipping trend pull');
    return { trends: [], feedsGenerated: 0 };
  }

  const sources = await getEnabledSources();
  const allTrends: any[] = [];
  const pullId = generatePullId();

  for (const source of sources) {
    try {
      const trends = await fetchFromSource(baseUrl, jwtToken, source, country, limit, lookbackDays);
      logger.info({ source, fetched: trends.length }, 'pullTrends: fetched from source');
      const saved = await saveTrends(trends, source, pullId);
      logger.info({ source, saved: saved.length, skippedDupes: trends.length - saved.length }, 'pullTrends: saved trends');
      allTrends.push(...saved);
    } catch (err) {
      logger.error({ err, source }, 'Failed to pull trends from source');
    }
  }

  await auditService.log({
    operator: 'system',
    eventType: 'TREND_PULL',
    module: 'trends',
    actionDetail: `Pulled ${allTrends.length} trends from ${sources.join(', ')}`,
    session: 'worker',
  });

  // --- Generate Feeds from new trends (GAS FeedGenerator logic) ---
  let feedsGenerated = 0;
  if (allTrends.length > 0) {
    const { generateFromTrend } = await import('../feed/feed.service.js');
    const prisma = getPrisma();

    const maxFeeds = parseInt(await configService.getValue('FEEDS_PER_TREND_PULL') || '5', 10);
    const maxPending = parseInt(await configService.getValue('MAX_PENDING_QUEUE') || '100', 10);
    const pendingCount = await prisma.feed.count({ where: { status: 'pending' } });

    for (const trend of allTrends) {
      if (feedsGenerated >= maxFeeds) break;
      if (pendingCount + feedsGenerated >= maxPending) {
        logger.info('pullTrends: pending queue full, stopping feed generation');
        break;
      }

      const result = await generateFromTrend(trend);
      if (result) {
        await markUsed(trend.id, result.feedId);
        feedsGenerated++;
      }
    }

    logger.info({ feedsGenerated, totalTrends: allTrends.length }, 'pullTrends: feed generation complete');
  }

  return { trends: allTrends, feedsGenerated };
}

async function getEnabledSources(): Promise<string[]> {
  const sources = ['medialens'];
  if ((await configService.getValue('ENABLE_LIHKG')) === 'true') sources.push('lihkg');
  if ((await configService.getValue('ENABLE_FB_VIRAL')) === 'true') sources.push('facebook');
  return sources;
}

async function refreshMlToken(baseUrl: string, currentToken: string): Promise<string | null> {
  try {
    const resp = await fetch(`${baseUrl}/auth/refresh-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const newToken = data.token || data.data?.token || data.accessToken || data.data?.accessToken;
    if (!newToken) return null;
    await configService.updateValue('MEDIALENS_JWT_TOKEN', newToken, 'system', '');
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    await configService.updateValue('MEDIALENS_JWT_TOKEN_EXPIRY', expiresAt, 'system', '');
    logger.info({ expiresAt }, 'MediaLens token refreshed automatically');
    return newToken;
  } catch (err) {
    logger.warn({ err }, 'MediaLens token refresh failed');
    return null;
  }
}

async function fetchFromSource(baseUrl: string, token: string, source: string, country: string, limit: number, lookbackDays: number): Promise<RawTrend[]> {
  // Each endpoint has different query params — mirrors GAS TrendPuller.js
  let url: string;
  if (source === 'lihkg') {
    url = `${baseUrl}/buzz/lihkg/viral-topics?days=${lookbackDays}&limit=${limit}`;
  } else if (source === 'facebook') {
    url = `${baseUrl}/buzz/fb/viral-posts?days=${lookbackDays}&countries=${country}&limit=${Math.ceil(limit / 2)}`;
  } else {
    url = `${baseUrl}/buzz/viral-topics?days=${lookbackDays}&countries=${country}&limit=${limit}`;
  }

  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  // 401 -> 自动 refresh token 后重试一次
  if (response.status === 401) {
    logger.warn('MediaLens JWT expired, attempting auto refresh');
    const newToken = await refreshMlToken(baseUrl, token);
    if (newToken) {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${newToken}` },
        signal: AbortSignal.timeout(15000),
      });
    }
    if (!newToken || response.status === 401) {
      logger.warn('MediaLens JWT refresh failed, needs reauthentication');
      // 发送邮件通知
      try {
        const { sendAlert } = await import('../../shared/email.js');
        const adminEmails = await configService.getValue('ADMIN_EMAILS');
        if (adminEmails) {
          for (const email of adminEmails.split(',').map((e: string) => e.trim()).filter(Boolean)) {
            await sendAlert(email,
              '[BK Admin] MediaLens Token 过期且刷新失败',
              `<h3>MediaLens Token 过期</h3><p>自动刷新失败，需要手动重新 OTP 验证。</p><p>时间：${new Date().toISOString()}</p>`
            );
          }
        }
      } catch { /* ignore email errors */ }
      return [];
    }
  }

  if (!response.ok) {
    logger.warn({ status: response.status, source }, 'MediaLens API error');
    return [];
  }

  const data = await response.json() as any;
  const inner = data.data || data;
  const result = Array.isArray(inner) ? inner : inner.viral_topics || inner.viral_posts || inner.topics || inner.posts || data.topics || data.posts || [];
  return result;
}

/**
 * Source-specific field mapping — mirrors GAS TrendPuller.js
 * Each MediaLens endpoint returns different field names.
 */
function normalizeTrend(raw: RawTrend, source: string, index: number): {
  topicLabel: string; summary: string; engagements: number; postCount: number; sentimentScore: number; sourceUrl: string | null;
} {
  if (source === 'lihkg') {
    return {
      topicLabel: raw.title || '',
      summary: `LIHKG ${raw.category || '吹水台'} — ${raw.replies || 0} 回覆`,
      engagements: raw.total_engagement || 0,
      postCount: raw.replies || 0,
      sentimentScore: 50, // LIHKG doesn't return sentiment
      sourceUrl: raw.lihkg_url || null,
    };
  }
  if (source === 'facebook') {
    return {
      topicLabel: raw.title || raw.message_preview || '(FB viral post)',
      summary: raw.message_preview || '',
      engagements: raw.engagements || raw.engagement || 0,
      postCount: 1,
      sentimentScore: 50, // FB doesn't return sentiment from this endpoint
      sourceUrl: raw.facebook_url || null,
    };
  }
  // medialens (viral-topics) — default
  return {
    topicLabel: raw.topic_label || raw.topic || raw.title || '',
    summary: raw.summary || raw.description || '',
    engagements: raw.engagements || raw.engagement || 0,
    postCount: raw.post_count || raw.posts || 0,
    sentimentScore: raw.sentiment_score ?? raw.sentiment ?? 50,
    sourceUrl: null,
  };
}

async function saveTrends(rawTrends: RawTrend[], source: string, pullId: string) {
  const prisma = getPrisma();
  const saved: any[] = [];

  for (let i = 0; i < rawTrends.length; i++) {
    const raw = rawTrends[i];
    const normalized = normalizeTrend(raw, source, i);
    if (!normalized.topicLabel) continue;

    // Skip if already exists (unique index on source + topicLabel)
    const exists = await prisma.trend.findFirst({ where: { source, topicLabel: normalized.topicLabel } });
    if (exists) continue;

    const tier = autoAssignTier(normalized.topicLabel);
    const score = normalized.sentimentScore;

    const trend = await prisma.trend.create({
      data: {
        pullId,
        source,
        rank: raw.rank ?? i + 1,
        topicLabel: normalized.topicLabel,
        summary: normalized.summary,
        engagements: normalized.engagements,
        postCount: normalized.postCount,
        sensitivityTier: tier,
        sentimentScore: score,
        sentimentLabel: score > 55 ? 'positive' : score < 45 ? 'negative' : 'neutral',
        sourceUrl: normalized.sourceUrl,
        rawData: raw,
      },
    });

    saved.push(trend);
  }

  return saved;
}

export async function list({ source, page = 1, limit = 20, sort = '-createdAt' }: { source?: string; page?: number; limit?: number; sort?: string }) {
  const prisma = getPrisma();
  const where: Record<string, string> = {};
  if (source) where.source = source;

  const skip = (page - 1) * limit;

  // Convert Mongoose-style sort string (e.g. "-createdAt") to Prisma orderBy
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const orderBy = { [field]: desc ? 'desc' as const : 'asc' as const };

  const [data, total] = await Promise.all([
    prisma.trend.findMany({ where, orderBy, skip, take: limit }),
    prisma.trend.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function markUsed(trendId: string, feedId: string): Promise<void> {
  const prisma = getPrisma();
  const trend = await prisma.trend.findUnique({ where: { id: trendId } });
  if (!trend) return;

  await prisma.trend.update({
    where: { id: trendId },
    data: { feedIds: [...(trend.feedIds || []), feedId] },
  });
}

function generatePullId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `PULL-${ts}-${rand}`;
}

// MediaLens OTP
export async function requestOtp(): Promise<boolean> {
  const baseUrl = await configService.getValue('MEDIALENS_BASE_URL');
  const email = await configService.getValue('MEDIALENS_AUTH_EMAIL');

  const response = await fetch(`${baseUrl}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(10000),
  });

  return response.ok;
}

export async function verifyOtp(otp: string): Promise<boolean> {
  const baseUrl = await configService.getValue('MEDIALENS_BASE_URL');
  const email = await configService.getValue('MEDIALENS_AUTH_EMAIL');

  const response = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token: otp }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json() as any;
  logger.info({ status: response.status, responseKeys: Object.keys(data) }, 'MediaLens OTP verify response');

  if (!response.ok || data.message === 'TOKEN_INVALID') {
    logger.warn({ status: response.status, message: data.message }, 'MediaLens OTP verify failed');
    return false;
  }

  // Try multiple possible token field paths
  const inner = data.data || data;
  const token = inner.token || inner.jwt || inner.access_token || inner.accessToken
    || data.token || data.jwt || data.access_token || data.accessToken;

  if (token) {
    await configService.updateValue('MEDIALENS_JWT_TOKEN', token, 'system', '');
    // Token valid for 23 hours (matching GAS TOKEN_TTL_MS)
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    await configService.updateValue('MEDIALENS_JWT_TOKEN_EXPIRY', expiresAt, 'system', '');
    logger.info({ expiresAt }, 'MediaLens JWT token saved to config');
  } else {
    logger.warn({ data }, 'MediaLens OTP verify: no token field in response — saving full response as token');
    // Some APIs return just the token string directly
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    if (raw && raw.length > 20 && raw.includes('.')) {
      // Looks like a JWT (has dots)
      await configService.updateValue('MEDIALENS_JWT_TOKEN', raw, 'system', '');
      logger.info('MediaLens JWT token saved (raw response)');
      return true;
    }
  }
  return !!token;
}
