import * as configService from '../config/config.service.js';
import ToneMode from '../tone/tone.model.js';
import Persona from '../persona/persona.model.js';
import TopicRule from '../topic-rules/topic-rules.model.js';
import type { PersonaDocument } from '../persona/persona.model.js';
import type { IGoogleTrends } from '../feed/feed.model.js';

interface BuildPromptParams {
  persona: string | PersonaDocument;
  toneMode?: string;
  topic?: string;
  summary?: string;
  sentimentScore?: number;
  sensitivityTier?: number;
  googleTrends?: IGoogleTrends | null;
  postType?: string;
  defaultRuleIds?: string[];
  excludeRuleIds?: string[];
}

/**
 * Build the full Gemini prompt from Persona + Tone + Trend + Rules + Google Trends.
 */
export async function buildPrompt({ persona, toneMode, topic, summary, sentimentScore, sensitivityTier, googleTrends, postType, defaultRuleIds, excludeRuleIds }: BuildPromptParams) {
  const systemPrompt = await configService.getValue('GEMINI_SYSTEM_PROMPT') ||
    '你係一個香港親子論壇嘅真實用戶，用繁體中文書寫。你嘅文字要自然、真實，有個人感受，唔係廣告。';

  const taskTemplate = await configService.getValue('GEMINI_TASK_TEMPLATE') ||
    '請用以上角色嘅口吻，寫一篇回覆（最多{max_chars}字）。只輸出帖文內容，唔好有前言或解釋。';

  // Resolve persona data
  const personaDoc = typeof persona === 'string'
    ? await Persona.findOne({ accountId: persona })
    : persona;

  // Resolve tone mode
  const resolvedToneMode = await resolveToneMode(personaDoc, toneMode, sentimentScore, sensitivityTier);
  const toneDoc = await ToneMode.findOne({ toneId: resolvedToneMode });

  // Match topic rules (with board context)
  const rule = await matchTopicRule(topic, { defaultRuleIds, excludeRuleIds });

  // Build user prompt blocks
  const blocks: string[] = [];

  // Persona block
  if (personaDoc) {
    blocks.push(`【角色設定】
帳號：${personaDoc.username}
類型：${personaDoc.archetype}
${personaDoc.voiceCues?.length ? `說話特點：${personaDoc.voiceCues.join('；')}` : ''}
${personaDoc.catchphrases?.length ? `口頭禪：${personaDoc.catchphrases.join('；')}` : ''}`);
  }

  // Tone block (or Tier 3 script override)
  if (sensitivityTier === 3 && personaDoc?.tier3Script) {
    blocks.push(`【語氣指引（敏感話題）】\n${personaDoc.tier3Script}`);
  } else if (toneDoc) {
    blocks.push(`【今日發文語氣：${toneDoc.displayName}】
${toneDoc.emotionalRegister ? `情感基調：${toneDoc.emotionalRegister}` : ''}
${toneDoc.openingStyle ? `開頭方式：${toneDoc.openingStyle}` : ''}
${toneDoc.sentenceStructure ? `句式風格：${toneDoc.sentenceStructure}` : ''}
${toneDoc.whatToAvoid ? `必須避免：${toneDoc.whatToAvoid}` : ''}
${toneDoc.exampleOpening ? `開頭示例：${toneDoc.exampleOpening}` : ''}`);
  }

  // Topic/Trend block
  if (topic) {
    blocks.push(`【今日熱話】
話題：${topic}
${summary ? `摘要：${summary}` : ''}
${sentimentScore !== undefined ? `情緒分：${sentimentScore}` : ''}
${sensitivityTier ? `敏感度：Tier ${sensitivityTier}` : ''}`);
  }

  // Rule hint block
  if (rule?.geminiPromptHint) {
    blocks.push(`【額外寫作指引】\n${rule.geminiPromptHint}`);
  }

  // Google Trends block
  if (googleTrends?.matched) {
    blocks.push(`【Google 熱點】
熱搜標題：${googleTrends.trendTitle}
熱度：${googleTrends.trendTraffic}`);
  }

  // Task template — substitute placeholders
  const maxChars = await configService.getValue('MEDIUM_POST_MAX_CHARS') || '300';
  const postTypeLabel = postType === 'new-post' ? '新帖' : '回覆';
  const lengthLabel = parseInt(maxChars) <= 150 ? '短' : parseInt(maxChars) <= 300 ? '中' : '長';
  blocks.push(
    taskTemplate
      .replace('{max_chars}', maxChars)
      .replace('{post_type}', postTypeLabel)
      .replace('{length}', lengthLabel),
  );

  return {
    systemPrompt,
    userPrompt: blocks.filter(Boolean).join('\n\n'),
    resolvedToneMode,
    rule,
  };
}

/**
 * Resolve tone mode using the priority chain:
 * Tier 3 forced -> negative sentiment -> rule specified -> persona primary -> default
 */
async function resolveToneMode(persona: PersonaDocument | null, requestedToneMode: string | undefined, sentimentScore: number | undefined, sensitivityTier: number | undefined): Promise<string> {
  const tier3Override = await configService.getValue('TONE_OVERRIDE_ON_TIER3') || 'EMPATHISE';
  const negativeThreshold = parseInt(await configService.getValue('SENTIMENT_NEGATIVE_THRESHOLD') || '45', 10);

  // 1. Tier 3 -> forced
  if (sensitivityTier === 3) return tier3Override;

  // 2. Negative sentiment -> EMPATHISE
  if (sentimentScore !== undefined && sentimentScore <= negativeThreshold) return 'EMPATHISE';

  // 3. Explicitly requested (non-auto)
  if (requestedToneMode && requestedToneMode !== 'auto') return requestedToneMode;

  // 4. Persona primary mode
  if (persona?.primaryToneMode) return persona.primaryToneMode;

  // 5. Default
  return 'INFO_SHARE';
}

/**
 * Match topic against TopicRules by keyword, with optional board context.
 */
interface MatchRuleOptions {
  defaultRuleIds?: string[];
  excludeRuleIds?: string[];
}

async function matchTopicRule(topic: string | undefined, options?: MatchRuleOptions) {
  const allRules = await TopicRule.find({ isActive: true });
  const excludeSet = new Set(options?.excludeRuleIds || []);

  // Filter out excluded rules
  const candidates = allRules.filter((r) => !excludeSet.has(r.ruleId));

  // Keyword match
  if (topic) {
    const topicLower = topic.toLowerCase();
    const matches = candidates.filter((r) =>
      r.topicKeywords.some((kw: string) => topicLower.includes(kw.toLowerCase()))
    );
    if (matches.length > 0) {
      return matches.sort((a, b) => b.sensitivityTier - a.sensitivityTier)[0];
    }
  }

  // Fallback: board default rules (when no keyword match)
  if (options?.defaultRuleIds?.length) {
    const defaultSet = new Set(options.defaultRuleIds);
    const defaults = candidates.filter((r) => defaultSet.has(r.ruleId));
    if (defaults.length > 0) {
      return defaults.sort((a, b) => b.sensitivityTier - a.sensitivityTier)[0];
    }
  }

  return null;
}

/**
 * Auto-assign sensitivity tier based on keywords (fallback when no rule matches).
 */
export function autoAssignTier(topic: string | undefined): number {
  if (!topic) return 1;
  const topicLower = topic.toLowerCase();

  const tier3Keywords = ['抑鬱', '崩潰', '離婚', '單親', '婆媳', 'adhd', '特殊教育', '自殺', '產後抑鬱'];
  const tier2Keywords = ['分娩', '母乳', '奶粉', 'vbac', '高齡', '情緒', '濕疹', '過敏'];

  if (tier3Keywords.some((kw) => topicLower.includes(kw))) return 3;
  if (tier2Keywords.some((kw) => topicLower.includes(kw))) return 2;
  return 1;
}

export { resolveToneMode, matchTopicRule };
