import { setupDB, teardownDB } from '../../helpers.js';
import { callGemini } from '../../../src/modules/gemini/gemini.service.js';
import { buildPrompt, autoAssignTier, resolveToneMode, matchTopicRule } from '../../../src/modules/gemini/prompt.builder.js';
import { findBestMatch, normalizeText } from '../../../src/modules/gemini/google-trends.service.js';
import { checkQuality, checkSimilarity } from '../../../src/modules/gemini/quality-guard.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import ToneMode from '../../../src/modules/tone/tone.model.js';
import TopicRule from '../../../src/modules/topic-rules/topic-rules.model.js';
import Config from '../../../src/modules/config/config.model.js';

beforeAll(async () => {
  await setupDB();
  await Persona.deleteMany({});
  await ToneMode.deleteMany({});
  await TopicRule.deleteMany({});
  await Config.deleteMany({});

  // Seed test data
  await ToneMode.create({
    toneId: 'EMPATHISE', displayName: '同理共感',
    openingStyle: '先表達理解', sentenceStructure: '短句',
    whatToAvoid: '不要說教', suitableForTier3: true, overridePriority: 1,
  });
  await ToneMode.create({
    toneId: 'CASUAL', displayName: '輕鬆閒聊',
    openingStyle: '隨意開頭', suitableForTier3: false, overridePriority: 3,
  });
  await Persona.create({
    accountId: 'BK001', username: 'testmom', archetype: 'pregnant',
    primaryToneMode: 'CASUAL', voiceCues: ['句首常用「唉」'],
    catchphrases: ['有冇人同我一樣？'], tier3Script: '沉默支持為主。',
    maxPostsPerDay: 3,
  });
  await TopicRule.create({
    ruleId: 'RULE-001', topicKeywords: ['IVF', '試管嬰兒'],
    sensitivityTier: 1, sentimentTrigger: 'any',
    priorityAccountIds: ['BK001'], assignToneMode: 'SHARE_EXP',
    geminiPromptHint: '強調過程而非結果',
  });
  await Config.create({ key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini' });
  await Config.create({ key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini' });
});

afterAll(async () => {
  await Persona.deleteMany({});
  await ToneMode.deleteMany({});
  await TopicRule.deleteMany({});
  await Config.deleteMany({});
  await teardownDB();
});

// --- Gemini Service (mock mode) ---
describe('Gemini Service', () => {
  it('returns mock response when no API key configured', async () => {
    const result = await callGemini('system', 'user prompt');
    expect(result.text).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('returns mock JSON response', async () => {
    const result = await callGemini('system', 'evaluate this', { json: true });
    expect(result.text.relevanceScore).toBeDefined();
    expect(result.text.worthReplying).toBeDefined();
    expect(result.text.replyText).toBeDefined();
  });
});

// --- Prompt Builder ---
describe('Prompt Builder', () => {
  it('builds prompt with persona + tone + topic', async () => {
    const result = await buildPrompt({
      persona: 'BK001',
      topic: '幼稚園面試',
      summary: '好多家長都好緊張',
      sentimentScore: 70,
      sensitivityTier: 1,
    });

    expect(result.systemPrompt).toContain('香港親子論壇');
    expect(result.userPrompt).toContain('testmom');
    expect(result.userPrompt).toContain('句首常用「唉」');
    expect(result.userPrompt).toContain('幼稚園面試');
    expect(result.resolvedToneMode).toBe('CASUAL'); // persona primary
  });

  it('uses Tier 3 script override for sensitive topics', async () => {
    const result = await buildPrompt({
      persona: 'BK001',
      topic: '產後抑鬱',
      sensitivityTier: 3,
    });

    expect(result.userPrompt).toContain('沉默支持為主');
    expect(result.resolvedToneMode).toBe('EMPATHISE');
  });

  it('overrides to EMPATHISE on negative sentiment', async () => {
    const result = await buildPrompt({
      persona: 'BK001',
      topic: 'test',
      sentimentScore: 30,
      sensitivityTier: 1,
    });

    expect(result.resolvedToneMode).toBe('EMPATHISE');
  });

  it('includes Google Trends block when matched', async () => {
    const result = await buildPrompt({
      persona: 'BK001',
      topic: 'test',
      googleTrends: { matched: true, trendTitle: 'Hot Topic', trendTraffic: '50K+' },
    });

    expect(result.userPrompt).toContain('Google 熱點');
    expect(result.userPrompt).toContain('Hot Topic');
  });

  it('includes rule prompt hint when topic matches', async () => {
    const result = await buildPrompt({
      persona: 'BK001',
      topic: '試管嬰兒經驗分享',
    });

    expect(result.userPrompt).toContain('強調過程而非結果');
  });
});

// --- Tone Mode Resolution ---
describe('resolveToneMode', () => {
  it('Tier 3 forces EMPATHISE', async () => {
    const tone = await resolveToneMode(null, null, 80, 3);
    expect(tone).toBe('EMPATHISE');
  });

  it('negative sentiment forces EMPATHISE', async () => {
    const tone = await resolveToneMode(null, null, 30, 1);
    expect(tone).toBe('EMPATHISE');
  });

  it('explicit tone mode used when provided', async () => {
    const tone = await resolveToneMode(null, 'CASUAL', 80, 1);
    expect(tone).toBe('CASUAL');
  });

  it('falls back to persona primary mode', async () => {
    const persona = await Persona.findOne({ accountId: 'BK001' });
    const tone = await resolveToneMode(persona, 'auto', 80, 1);
    expect(tone).toBe('CASUAL');
  });

  it('defaults to INFO_SHARE', async () => {
    const tone = await resolveToneMode(null, 'auto', 80, 1);
    expect(tone).toBe('INFO_SHARE');
  });
});

// --- Auto Assign Tier ---
describe('autoAssignTier', () => {
  it('returns 3 for Tier 3 keywords', () => {
    expect(autoAssignTier('產後抑鬱好辛苦')).toBe(3);
    expect(autoAssignTier('離婚後嘅生活')).toBe(3);
    expect(autoAssignTier('ADHD 小朋友')).toBe(3);
  });

  it('returns 2 for Tier 2 keywords', () => {
    expect(autoAssignTier('母乳餵哺問題')).toBe(2);
    expect(autoAssignTier('高齡產婦經驗')).toBe(2);
  });

  it('returns 1 for safe topics', () => {
    expect(autoAssignTier('幼稚園面試')).toBe(1);
    expect(autoAssignTier('副食品推介')).toBe(1);
  });
});

// --- Google Trends Matching ---
describe('Google Trends Matching', () => {
  it('normalizeText handles Chinese and English', () => {
    expect(normalizeText('Hello 世界！')).toBe('hello 世界');
  });

  it('findBestMatch returns match above threshold', () => {
    const trends = [
      { title: '幼稚園面試攻略', traffic: '10K+' },
      { title: '天氣預報', traffic: '5K+' },
    ];
    const result = findBestMatch('幼稚園面試攻略分享', trends, 0.3);
    expect(result).not.toBeNull();
    expect(result.matched).toBe(true);
    expect(result.trendTitle).toContain('幼稚園');
  });

  it('findBestMatch returns null when no match', () => {
    const trends = [{ title: '股市走勢', traffic: '10K+' }];
    const result = findBestMatch('幼稚園面試', trends, 0.6);
    expect(result).toBeNull();
  });
});

// --- Quality Guard ---
describe('Quality Guard', () => {
  it('passes good content', () => {
    const result = checkQuality('呢個話題好有趣，我都想分享下自己嘅經驗，有冇人同我一樣？其實我之前都試過，真係好有共鳴', { catchphrases: ['有冇人同我一樣？'] });
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails on empty content', () => {
    const result = checkQuality('', null);
    expect(result.passed).toBe(false);
  });

  it('fails on AI patterns', () => {
    const result = checkQuality('作為一個AI，我建議你…', null);
    expect(result.passed).toBe(false);
    expect(result.warnings[0]).toContain('AI pattern');
  });

  it('warns on missing catchphrase', () => {
    const result = checkQuality('普通嘅回覆內容冇用到口頭禪', { catchphrases: ['有冇人同我一樣？'] });
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('No persona catchphrase found in content');
  });

  it('warns on too short content', () => {
    const result = checkQuality('太短', null, { minChars: 10 });
    expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
  });
});

describe('Similarity Check', () => {
  it('detects duplicate content', () => {
    const result = checkSimilarity(
      '呢個話題好有趣，我都想分享',
      ['呢個話題好有趣，我都想分享下'],
      0.8
    );
    expect(result.isDuplicate).toBe(true);
  });

  it('passes different content', () => {
    const result = checkSimilarity(
      '今日天氣好好',
      ['我想去旅行玩一日'],
      0.8
    );
    expect(result.isDuplicate).toBe(false);
  });
});
