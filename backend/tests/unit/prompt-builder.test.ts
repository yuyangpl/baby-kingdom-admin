/**
 * Unit tests for prompt.builder.js
 * Tests: buildPrompt, autoAssignTier, resolveToneMode, matchTopicRule
 */

import { setupDB, teardownDB } from '../helpers.js';
import { getPrisma } from '../../src/shared/database.js';
import { buildPrompt, autoAssignTier, resolveToneMode, matchTopicRule } from '../../src/modules/gemini/prompt.builder.js';

// Unique prefix to avoid conflicts with parallel tests
const PREFIX = 'pb-unit';

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();

  // Clean up test data
  await prisma.topicRule.deleteMany({ where: { ruleId: { startsWith: PREFIX } } });
  await prisma.config.deleteMany({ where: { key: { in: ['SENTIMENT_NEGATIVE_THRESHOLD', 'TONE_OVERRIDE_ON_TIER3', 'GEMINI_SYSTEM_PROMPT', 'MEDIUM_POST_MAX_CHARS', 'GEMINI_TASK_TEMPLATE'] } } });
  await prisma.persona.deleteMany({ where: { accountId: { startsWith: PREFIX } } });
  await prisma.toneMode.deleteMany({ where: { toneId: { startsWith: PREFIX } } });

  // Seed configs needed by resolveToneMode / buildPrompt
  await prisma.config.create({ data: { key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini' } });
  await prisma.config.create({ data: { key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini' } });
  await prisma.config.create({ data: { key: 'MEDIUM_POST_MAX_CHARS', value: '300', category: 'gemini' } });

  // Seed a tone mode used by buildPrompt
  await prisma.toneMode.create({
    data: {
      toneId: `${PREFIX}-CASUAL`,
      displayName: '輕鬆閒聊',
      openingStyle: '隨意開頭',
      sentenceStructure: '口語化短句',
      whatToAvoid: '不要太正式',
      suitableForTier3: false,
      overridePriority: 3,
    },
  });

  // Seed a persona with voiceCues and tier3Script
  await prisma.persona.create({
    data: {
      accountId: `${PREFIX}-P001`,
      username: 'unit-test-mom',
      archetype: 'pregnant',
      primaryToneMode: `${PREFIX}-CASUAL`,
      voiceCues: ['句首常用「唉」', '愛用省略號'],
      catchphrases: ['大家點睇？'],
      tier3Script: '保持沉默，不輕易建議。',
      maxPostsPerDay: 3,
    },
  });

  // Seed a persona WITHOUT voiceCues
  await prisma.persona.create({
    data: {
      accountId: `${PREFIX}-P002`,
      username: 'unit-test-dad',
      archetype: 'multi-kid',
      primaryToneMode: `${PREFIX}-CASUAL`,
      voiceCues: [],
      catchphrases: [],
      tier3Script: null,
      maxPostsPerDay: 3,
    },
  });
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.topicRule.deleteMany({ where: { ruleId: { startsWith: PREFIX } } });
  await prisma.config.deleteMany({ where: { key: { in: ['SENTIMENT_NEGATIVE_THRESHOLD', 'TONE_OVERRIDE_ON_TIER3', 'GEMINI_SYSTEM_PROMPT', 'MEDIUM_POST_MAX_CHARS', 'GEMINI_TASK_TEMPLATE'] } } });
  await prisma.persona.deleteMany({ where: { accountId: { startsWith: PREFIX } } });
  await prisma.toneMode.deleteMany({ where: { toneId: { startsWith: PREFIX } } });
  await teardownDB();
});

// -- autoAssignTier (pure function, no DB) --

describe('autoAssignTier', () => {
  it('T1: mixed Tier2+Tier3 keywords -> returns Tier3 (highest wins)', () => {
    const result = autoAssignTier('情緒失控加埋抑鬱真係好辛苦');
    expect(result).toBe(3);
  });

  it('T2: returns 3 for 抑鬱 keyword', () => {
    expect(autoAssignTier('產後抑鬱好辛苦')).toBe(3);
  });

  it('T3: returns 3 for ADHD (case-insensitive)', () => {
    expect(autoAssignTier('ADHD小朋友點教？')).toBe(3);
  });

  it('T4: returns 2 for Tier2 keyword with no Tier3', () => {
    expect(autoAssignTier('母乳餵哺問題')).toBe(2);
  });

  it('T5: returns 1 for safe topic', () => {
    expect(autoAssignTier('幼稚園面試準備')).toBe(1);
  });

  it('T6: returns 1 for null/empty topic', () => {
    expect(autoAssignTier(null)).toBe(1);
    expect(autoAssignTier('')).toBe(1);
  });
});

// -- matchTopicRule (needs DB) --

describe('matchTopicRule', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.topicRule.deleteMany({ where: { ruleId: { startsWith: `${PREFIX}-rule` } } });
  });

  it('T7: multiple rules matching same topic -> returns highest sensitivityTier', async () => {
    const prisma = getPrisma();
    await prisma.topicRule.create({
      data: {
        ruleId: `${PREFIX}-rule-low`,
        topicKeywords: ['試管嬰兒'],
        sensitivityTier: 1,
        sentimentTrigger: 'any',
      },
    });
    await prisma.topicRule.create({
      data: {
        ruleId: `${PREFIX}-rule-high`,
        topicKeywords: ['試管嬰兒', 'IVF'],
        sensitivityTier: 3,
        sentimentTrigger: 'any',
      },
    });

    const result = await matchTopicRule('IVF 試管嬰兒分享');
    expect(result).not.toBeNull();
    expect(result.sensitivityTier).toBe(3);
  });

  it('T8: keyword match is case-insensitive', async () => {
    const prisma = getPrisma();
    await prisma.topicRule.create({
      data: {
        ruleId: `${PREFIX}-rule-case`,
        topicKeywords: ['IVF'],
        sensitivityTier: 2,
        sentimentTrigger: 'any',
      },
    });

    const result = await matchTopicRule('ivf 經驗分享');
    expect(result).not.toBeNull();
    expect(result.ruleId).toBe(`${PREFIX}-rule-case`);
  });

  it('T9: isActive=false rules are not matched', async () => {
    const prisma = getPrisma();
    await prisma.topicRule.create({
      data: {
        ruleId: `${PREFIX}-rule-inactive`,
        topicKeywords: ['特殊教育'],
        sensitivityTier: 3,
        sentimentTrigger: 'any',
        isActive: false,
      },
    });

    const result = await matchTopicRule('特殊教育支援計劃');
    expect(result).toBeNull();
  });
});

// -- resolveToneMode (needs DB for Config) --

describe('resolveToneMode', () => {
  it('T10: sentimentScore=45 triggers negative -> EMPATHISE', async () => {
    const tone = await resolveToneMode(null, 'auto', 45, 1);
    expect(tone).toBe('EMPATHISE');
  });

  it('T11: sentimentScore=46 does NOT trigger negative sentiment', async () => {
    const tone = await resolveToneMode(null, 'auto', 46, 1);
    expect(tone).toBe('INFO_SHARE');
  });
});

// -- buildPrompt (needs DB) --

describe('buildPrompt', () => {
  it('T1: persona=null produces no persona block (no 角色 section)', async () => {
    const result = await buildPrompt({
      persona: null,
      topic: '幼稚園面試',
      sentimentScore: 70,
      sensitivityTier: 1,
    });
    expect(result.userPrompt).not.toContain('【角色設定】');
  });

  it('T2: persona without voiceCues skips voiceCues line', async () => {
    const result = await buildPrompt({
      persona: `${PREFIX}-P002`,
      topic: '幼稚園面試',
      sentimentScore: 70,
      sensitivityTier: 1,
    });
    expect(result.userPrompt).toContain('unit-test-dad');
    expect(result.userPrompt).not.toContain('說話特點：');
  });

  it('T3: Tier3 with no tier3Script falls back to toneDoc', async () => {
    const result = await buildPrompt({
      persona: `${PREFIX}-P002`,
      topic: '離婚custody問題',
      sentimentScore: 70,
      sensitivityTier: 3,
    });
    expect(result.resolvedToneMode).toBe('EMPATHISE');
    expect(result.userPrompt).not.toContain('保持沉默，不輕易建議');
  });

  it('T4: topic=null produces no topic block', async () => {
    const result = await buildPrompt({
      persona: `${PREFIX}-P001`,
      topic: null,
      sentimentScore: 70,
      sensitivityTier: 1,
    });
    expect(result.userPrompt).not.toContain('【今日熱話】');
  });

  it('T5: MEDIUM_POST_MAX_CHARS replaces {max_chars} in task template', async () => {
    const result = await buildPrompt({
      persona: `${PREFIX}-P001`,
      topic: '幼稚園面試',
      sentimentScore: 70,
      sensitivityTier: 1,
    });
    expect(result.userPrompt).toContain('300');
    expect(result.userPrompt).not.toContain('{max_chars}');
  });

  it('T6: GEMINI_SYSTEM_PROMPT custom value used as systemPrompt', async () => {
    const prisma = getPrisma();
    // Seed a custom system prompt
    await prisma.config.create({ data: { key: 'GEMINI_SYSTEM_PROMPT', value: '你係自訂系統提示語。', category: 'gemini' } });

    const result = await buildPrompt({
      persona: `${PREFIX}-P001`,
      topic: '幼稚園面試',
      sentimentScore: 70,
      sensitivityTier: 1,
    });
    expect(result.systemPrompt).toBe('你係自訂系統提示語。');

    await prisma.config.deleteMany({ where: { key: 'GEMINI_SYSTEM_PROMPT' } });
  });
});
