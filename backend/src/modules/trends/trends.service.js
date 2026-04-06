import Trend from './trends.model.js';
import * as configService from '../config/config.service.js';
import { autoAssignTier } from '../gemini/prompt.builder.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

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
  const allTrends = [];
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

  return allTrends;
}

async function getEnabledSources() {
  const sources = ['medialens'];
  if ((await configService.getValue('ENABLE_LIHKG')) === 'true') sources.push('lihkg');
  if ((await configService.getValue('ENABLE_FB_VIRAL')) === 'true') sources.push('facebook');
  return sources;
}

async function fetchFromSource(baseUrl, token, source, country, limit, lookbackDays) {
  const endpoints = {
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

  const data = await response.json();
  return Array.isArray(data) ? data : data.topics || data.posts || [];
}

async function saveTrends(rawTrends, source, pullId) {
  const saved = [];

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
      sentimentLabel: sentimentScore > 55 ? 'positive' : sentimentScore < 45 ? 'negative' : 'neutral',
      toneMode: null, // assigned during feed generation
    });

    saved.push(trend);
  }

  return saved;
}

export async function list({ source, page = 1, limit = 20, sort = '-createdAt' }) {
  const filter = {};
  if (source) filter.source = source;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Trend.find(filter).sort(sort).skip(skip).limit(limit),
    Trend.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function markUsed(trendId, feedId) {
  await Trend.findByIdAndUpdate(trendId, {
    isUsed: true,
    usedAt: new Date(),
    $push: { feedIds: feedId },
  });
}

function generatePullId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `PULL-${ts}-${rand}`;
}

// MediaLens OTP
export async function requestOtp() {
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

export async function verifyOtp(otp) {
  const baseUrl = await configService.getValue('MEDIALENS_BASE_URL');
  const email = await configService.getValue('MEDIALENS_AUTH_EMAIL');

  const response = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return false;

  const data = await response.json();
  const token = data.token || data.jwt;
  if (token) {
    await configService.updateValue('MEDIALENS_JWT_TOKEN', token, 'system', '');
  }
  return !!token;
}
