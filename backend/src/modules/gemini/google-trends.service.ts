import * as configService from '../config/config.service.js';
import { callGemini } from './gemini.service.js';
import logger from '../../shared/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface TrendMatch {
  matched: boolean;
  trendTitle: string;
  trendTraffic: string;
  matchScore: number;
}

/** Raw trend item from Summary API */
export interface RawTrend {
  query: string;
  score?: number;
  peak_volume?: number;
  duration_hours?: number;
  categories?: string[];
  trend_breakdown?: string[];
}

/** Enriched trend with news from Detail API */
export interface EnrichedTrend {
  query: string;
  score: number;
  peakVolume: number;
  durationHours: number;
  categories: string[];
  trendBreakdown: string[];
  news: Array<{ headline: string; url: string }>;
}

/** Gemini-analyzed trend */
export interface AnalyzedTrend {
  query: string;
  summary: string;
  parentingRelevance: 'high' | 'medium' | 'low' | 'none';
  suggestedAngle: string;
  safeToMention: boolean;
}

export interface TrendsAnalysis {
  analyzedTrends: AnalyzedTrend[];
  topPick: string;
  reasoning: string;
}

// ── Date utilities (UTC) ───────────────────────────────────

function utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcDaysAgoDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Internal API calls ─────────────────────────────────────

/**
 * Generic REST GET call to the Google Trends API.
 */
async function callTrendsRest(baseUrl: string, path: string, apiKey: string): Promise<any | null> {
  const url = baseUrl + path;
  logger.debug({ url }, 'Google Trends API GET');

  try {
    const resp = await fetch(url, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.status === 401) {
      logger.warn('Google Trends API 401 Unauthorized');
      return null;
    }
    if (!resp.ok) {
      logger.warn({ status: resp.status }, 'Google Trends API non-200 response');
      return null;
    }

    const json = await resp.json() as any;
    if (json.error) {
      logger.warn({ error: json.error }, 'Google Trends API returned error');
      return null;
    }
    return json;
  } catch (err) {
    logger.warn({ err }, 'Google Trends API call failed');
    return null;
  }
}

/**
 * GET /trends/summary — date-range trend rankings.
 */
async function callTrendsSummary(
  baseUrl: string, apiKey: string, geo: string, startDate: string, endDate: string,
): Promise<any | null> {
  const qs = `geo=${encodeURIComponent(geo)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
  return callTrendsRest(baseUrl, `/trends/summary?${qs}`, apiKey);
}

/**
 * GET /trends/detail — single trend timeline with news.
 */
async function callTrendsDetail(
  baseUrl: string, apiKey: string, query: string, geo: string, startDate: string, endDate: string,
): Promise<any | null> {
  const qs = `query=${encodeURIComponent(query)}&geo=${encodeURIComponent(geo)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
  return callTrendsRest(baseUrl, `/trends/detail?${qs}`, apiKey);
}

// ── Public functions ───────────────────────────────────────

/**
 * Fetch Google Trends Top N with news enrichment from Detail API.
 * Matches the original GAS GoogleTrendsFeed.fetchGoogleTrends() flow:
 *   Summary API (rankings) → Detail API (news per trend) → enriched array.
 */
export async function fetchGoogleTrends(): Promise<EnrichedTrend[]> {
  const enabled = await configService.getValue('GOOGLE_TRENDS_ENABLED');
  if (enabled === 'false') return [];

  const apiKey = await configService.getValue('GOOGLE_TRENDS_API_KEY');
  const baseUrl = await configService.getValue('GOOGLE_TRENDS_BASE_URL') || 'https://seo-hk-mac.rankwriteai.com';

  if (!apiKey) {
    logger.debug('GOOGLE_TRENDS_API_KEY not configured, skipping');
    return [];
  }

  const geo = await configService.getValue('GTRENDS_GEO') || 'HK';
  const lookDays = parseInt(await configService.getValue('GTRENDS_LOOKBACK_DAYS') || '1', 10);
  const topN = parseInt(await configService.getValue('GTRENDS_TOP_N') || '10', 10);
  const endDate = utcDateStr();
  const startDate = utcDaysAgoDateStr(lookDays);

  logger.info({ geo, startDate, endDate }, 'fetchGoogleTrends: pulling summary');

  const data = await callTrendsSummary(baseUrl, apiKey, geo, startDate, endDate);
  if (!data || !data.trends || data.trends.length === 0) {
    logger.info('fetchGoogleTrends: Summary API returned no data');
    return [];
  }

  logger.info({ count: data.trends.length }, 'fetchGoogleTrends: Summary API returned trends');
  const top: RawTrend[] = data.trends.slice(0, topN);

  // Enrich Top N with Detail API for news
  const enriched: EnrichedTrend[] = [];
  for (const t of top) {
    const news: Array<{ headline: string; url: string }> = [];
    try {
      const detail = await callTrendsDetail(baseUrl, apiKey, t.query, geo, startDate, endDate);
      if (detail?.timeline) {
        const seenHeadlines = new Set<string>();
        for (const snap of detail.timeline) {
          for (const n of snap.news || []) {
            if (n.headline && !seenHeadlines.has(n.headline)) {
              seenHeadlines.add(n.headline);
              news.push({ headline: n.headline, url: n.url || '' });
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err, query: t.query }, 'fetchGoogleTrends: Detail API failed for trend');
    }

    enriched.push({
      query: t.query,
      score: t.score || 0,
      peakVolume: t.peak_volume || 0,
      durationHours: t.duration_hours || 0,
      categories: t.categories || [],
      trendBreakdown: t.trend_breakdown || [],
      news,
    });
  }

  return enriched;
}

/**
 * Analyze trends with Gemini — extract parenting relevance, suggested angles, safety flags.
 * Matches the original GAS analyzeTrendsWithGemini() logic.
 */
export async function analyzeTrendsWithGemini(trends: EnrichedTrend[]): Promise<TrendsAnalysis | null> {
  if (!trends || trends.length === 0) return null;

  const systemPrompt = '你係一個香港社交媒體趨勢分析師，專注親子/家庭/教育領域。用繁體中文回覆。';

  const dataBlock = trends.map((t, i) => {
    const lines = [`#${i + 1} ${t.query}`];
    if (t.categories.length > 0) lines.push(`  分類: ${t.categories.join(', ')}`);
    if (t.trendBreakdown.length > 0) lines.push(`  相關搜索: ${t.trendBreakdown.join(', ')}`);
    if (t.news.length > 0) {
      lines.push('  相關新聞:');
      t.news.slice(0, 5).forEach((n) => lines.push(`    - ${n.headline}`));
    }
    return lines.join('\n');
  }).join('\n\n');

  const userPrompt = `以下係最新嘅 Google 熱門搜索數據（香港）。
請整理分析，提取對親子論壇用戶有價值嘅熱點資訊。

【原始熱搜數據】
${dataBlock}

【分析要求】
1. 每條熱搜用 1-2 句話概括「發生咗咩事」（基於新聞標題和相關搜索推斷）
2. 標記與親子/家庭/教育/健康可能有關聯嘅話題
3. 對每條熱搜給出「討論角度建議」— 如果要喺親子論壇自然提及，可以點樣切入
4. 過濾掉純娛樂八卦、政治敏感等不適合嘅話題
5. 只輸出最重要嘅 5 條（從輸入中選取），其餘跳過

【輸出限制】
- 整個 JSON 回覆必須控制在 2000 字以內
- summary 每條不超過 50 字
- suggestedAngle 每條不超過 40 字
- reasoning 不超過 100 字

請只輸出以下 JSON，不要其他文字或 markdown：
{
  "analyzedTrends": [
    {
      "query": "原始搜索詞",
      "summary": "事件概括（≤50字）",
      "parentingRelevance": "high/medium/low/none",
      "suggestedAngle": "親子論壇切入角度（≤40字，如 none 則寫空字串）",
      "safeToMention": true或false
    }
  ],
  "topPick": "最值得在親子論壇提及的話題（query）",
  "reasoning": "整體分析簡述（≤100字）"
}`;

  try {
    const result = await callGemini(systemPrompt, userPrompt, { json: true, maxOutputTokens: 4096 });
    if (!result?.text) {
      logger.info('analyzeTrendsWithGemini: Gemini returned empty');
      return null;
    }
    const clean = (typeof result.text === 'string' ? result.text : JSON.stringify(result.text))
      .replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as TrendsAnalysis;
    logger.info({ count: parsed.analyzedTrends?.length, topPick: parsed.topPick }, 'analyzeTrendsWithGemini: done');
    return parsed;
  } catch (err) {
    logger.error({ err }, 'analyzeTrendsWithGemini: failed');
    return null;
  }
}

/**
 * Format Gemini analysis into a text block for injection into reply prompts.
 * Only includes trends that are safeToMention and have parenting relevance.
 */
export function formatTrendsContext(analysis: TrendsAnalysis | null): string {
  if (!analysis?.analyzedTrends?.length) return '';

  const relevant = analysis.analyzedTrends.filter(
    (t) => t.safeToMention && t.parentingRelevance !== 'none',
  );
  if (relevant.length === 0) return '';

  return relevant.map((t, i) => {
    const parts = [`${i + 1}. ${t.query}：${t.summary}`];
    if (t.suggestedAngle) parts.push(`   切入角度：${t.suggestedAngle}`);
    parts.push(`   相關性：${t.parentingRelevance}`);
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * Match a topic against current Google Trends.
 * Used by Scanner to check if a thread topic is trending.
 */
export async function matchGoogleTrends(topic: string): Promise<TrendMatch | null> {
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
    const lookDays = parseInt(await configService.getValue('GTRENDS_LOOKBACK_DAYS') || '1', 10);
    const endDate = utcDateStr();
    const startDate = utcDaysAgoDateStr(lookDays);

    const data = await callTrendsSummary(baseUrl, apiKey, geo, startDate, endDate);
    if (!data?.trends?.length) return null;

    return findBestMatch(topic, data.trends, threshold);
  } catch (err) {
    logger.warn({ err }, 'Google Trends matching failed, skipping');
    return null;
  }
}

/**
 * Keyword matching between topic and trends.
 */
function findBestMatch(topic: string, trends: RawTrend[], threshold: number): TrendMatch | null {
  if (!topic || !Array.isArray(trends) || trends.length === 0) return null;

  const topicWords = normalizeText(topic).split(/\s+/);
  let bestMatch: TrendMatch | null = null;
  let bestScore = 0;

  for (const trend of trends) {
    const trendTitle = trend.query || '';
    const trendWords = normalizeText(trendTitle).split(/\s+/);

    const overlap = topicWords.filter((w) => trendWords.some((tw) => tw.includes(w) || w.includes(tw))).length;
    const score = overlap / Math.max(topicWords.length, 1);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = {
        matched: true,
        trendTitle,
        trendTraffic: String(trend.peak_volume || 'N/A'),
        matchScore: Math.round(score * 100) / 100,
      };
    }
  }

  return bestMatch;
}

/**
 * Normalize text for matching: lowercase, remove punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { findBestMatch, normalizeText };
