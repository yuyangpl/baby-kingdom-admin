import Trend from './trends.model.js';
import * as configService from '../config/config.service.js';
import { autoAssignTier } from '../gemini/prompt.builder.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

interface RawTrend {
  topic_label?: string;
  title?: string;
  topic?: string;
  summary?: string;
  description?: string;
  engagements?: number;
  engagement?: number;
  post_count?: number;
  posts?: number;
  sentiment_score?: number;
  sentiment?: number;
  [key: string]: any;
}

/**
 * Pull trends from MediaLens API.
 * Returns pulled trends array.
 */
export async function pullTrends() {
  const baseUrl = await configService.getValue('MEDIALENS_BASE_URL');
  const jwtToken = await configService.getValue('MEDIALENS_JWT_TOKEN');
  const country = await configService.getValue('MEDIALENS_COUNTRY') || 'HK';
  const limit = parseInt(await configService.getValue('TREND_LIMIT') || '20', 10);
  const lookbackDays = parseInt(await configService.getValue('TREND_LOOKBACK_DAYS') || '1', 10);

  if (!baseUrl || !jwtToken) {
    logger.warn('MediaLens not configured, skipping trend pull');
    return [];
  }

  const sources = await getEnabledSources();
  const allTrends: any[] = [];
  const pullId = generatePullId();

  for (const source of sources) {
    try {
      const trends = await fetchFromSource(baseUrl, jwtToken, source, country, limit, lookbackDays);
      const saved = await saveTrends(trends, source, pullId);
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
    const { default: Feed } = await import('../feed/feed.model.js');

    const maxFeeds = parseInt(await configService.getValue('FEEDS_PER_TREND_PULL') || '5', 10);
    const maxPending = parseInt(await configService.getValue('MAX_PENDING_QUEUE') || '100', 10);
    const pendingCount = await Feed.countDocuments({ status: 'pending' });

    for (const trend of allTrends) {
      if (feedsGenerated >= maxFeeds) break;
      if (pendingCount + feedsGenerated >= maxPending) {
        logger.info('pullTrends: pending queue full, stopping feed generation');
        break;
      }

      const feedId = await generateFromTrend(trend);
      if (feedId) {
        await markUsed(trend._id.toString(), feedId);
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

async function fetchFromSource(baseUrl: string, token: string, source: string, country: string, limit: number, lookbackDays: number): Promise<RawTrend[]> {
  const endpoints: Record<string, string> = {
    medialens: '/buzz/viral-topics',
    lihkg: '/buzz/lihkg/viral-topics',
    facebook: '/buzz/fb/viral-posts',
  };

  const url = `${baseUrl}${endpoints[source]}?country=${country}&limit=${limit}&lookback_days=${lookbackDays}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 401) {
    logger.warn('MediaLens JWT expired, needs reauthentication');
    return [];
  }

  if (!response.ok) {
    logger.warn({ status: response.status, source }, 'MediaLens API error');
    return [];
  }

  const data = await response.json() as any;
  const inner = data.data || data;
  return Array.isArray(inner) ? inner : inner.viral_topics || inner.topics || inner.posts || data.topics || data.posts || [];
}

async function saveTrends(rawTrends: RawTrend[], source: string, pullId: string) {
  const saved: any[] = [];

  for (let i = 0; i < rawTrends.length; i++) {
    const raw = rawTrends[i];
    const topicLabel = raw.topic_label || raw.title || raw.topic || '';
    if (!topicLabel) continue;

    // Skip if already exists (unique index on source + topicLabel)
    const exists = await Trend.findOne({ source, topicLabel });
    if (exists) continue;

    const sentimentScore = raw.sentiment_score ?? raw.sentiment ?? null;
    const tier = autoAssignTier(topicLabel);

    const trend = await Trend.create({
      pullId,
      source,
      rank: i + 1,
      topicLabel,
      summary: raw.summary || raw.description || '',
      engagements: raw.engagements || raw.engagement || 0,
      postCount: raw.post_count || raw.posts || 0,
      sensitivityTier: tier,
      sentimentScore,
      sentimentLabel: sentimentScore != null && sentimentScore > 55 ? 'positive' : sentimentScore != null && sentimentScore < 45 ? 'negative' : 'neutral',
      toneMode: null, // assigned during feed generation
    });

    saved.push(trend);
  }

  return saved;
}

export async function list({ source, page = 1, limit = 20, sort = '-createdAt' }: { source?: string; page?: number; limit?: number; sort?: string }) {
  const filter: Record<string, string> = {};
  if (source) filter.source = source;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Trend.find(filter).sort(sort).skip(skip).limit(limit),
    Trend.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function markUsed(trendId: string, feedId: string): Promise<void> {
  await Trend.findByIdAndUpdate(trendId, {
    isUsed: true,
    usedAt: new Date(),
    $push: { feedIds: feedId },
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
    logger.info('MediaLens JWT token saved to config');
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
