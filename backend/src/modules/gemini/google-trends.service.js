import * as configService from '../config/config.service.js';
import logger from '../../shared/logger.js';

/**
 * Fetch Google Trends and check if any match the given topic.
 * Uses self-hosted Google Trends API at seo-hk-mac.rankwriteai.com.
 */
export async function matchGoogleTrends(topic) {
  const enabled = await configService.getValue('GOOGLE_TRENDS_ENABLED');
  if (enabled === 'false') return null;

  const apiKey = await configService.getValue('GOOGLE_TRENDS_API_KEY');
  const baseUrl = await configService.getValue('GOOGLE_TRENDS_BASE_URL') || 'https://seo-hk-mac.rankwriteai.com';
  const threshold = parseFloat(await configService.getValue('GOOGLE_TRENDS_MATCH_THRESHOLD') || '0.6');

  if (!apiKey) {
    logger.debug('GOOGLE_TRENDS_API_KEY not configured, skipping trends matching');
    return null;
  }

  try {
    const geo = await configService.getValue('GTRENDS_GEO') || 'HK';
    const topN = parseInt(await configService.getValue('GTRENDS_TOP_N') || '10', 10);

    const response = await fetch(`${baseUrl}/trends/summary?geo=${geo}&limit=${topN}`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Google Trends API error');
      return null;
    }

    const trends = await response.json();
    return findBestMatch(topic, trends, threshold);
  } catch (err) {
    logger.warn({ err }, 'Google Trends matching failed, skipping');
    return null; // graceful degradation
  }
}

/**
 * Simple keyword matching between topic and trends.
 * Returns matched trend or null.
 */
function findBestMatch(topic, trends, threshold) {
  if (!topic || !Array.isArray(trends) || trends.length === 0) return null;

  const topicWords = normalizeText(topic).split(/\s+/);
  let bestMatch = null;
  let bestScore = 0;

  for (const trend of trends) {
    const trendTitle = trend.title || trend.topic || '';
    const trendWords = normalizeText(trendTitle).split(/\s+/);

    // Calculate overlap score
    const overlap = topicWords.filter((w) => trendWords.some((tw) => tw.includes(w) || w.includes(tw))).length;
    const score = overlap / Math.max(topicWords.length, 1);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = {
        matched: true,
        trendTitle,
        trendTraffic: trend.traffic || trend.searchVolume || 'N/A',
        matchScore: Math.round(score * 100) / 100,
      };
    }
  }

  return bestMatch;
}

/**
 * Normalize text for matching: lowercase, remove punctuation.
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { findBestMatch, normalizeText };
