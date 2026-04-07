/**
 * Unit tests for quality-guard.js
 * Tests: checkQuality (AI patterns, format checks) and checkSimilarity
 * All functions are pure — no DB needed.
 */

import { checkQuality, checkSimilarity } from '../../src/modules/gemini/quality-guard.js';

const AI_PATTERNS = [
  '作为一个ai',
  '作為一個ai',
  '我是语言模型',
  '我是語言模型',
  'as an ai',
  'i am a language model',
  'i cannot',
];

const GOOD_CONTENT = '呢個話題好有趣，我都有類似嘅經驗想分享，希望對大家有幫助。其實係咁架，大家唔好擔心。';

// ── AI Pattern Detection (7 patterns) ──────────────────────────────────────

describe('checkQuality — AI pattern detection', () => {
  AI_PATTERNS.forEach((pattern, index) => {
    it(`T${index + 1}: pattern "${pattern}" triggers passed=false`, () => {
      // Embed pattern in otherwise valid content
      const content = `呢個問題好複雜。${pattern}，我建議你試試呢個方法，希望對你有幫助。`;
      const result = checkQuality(content, null);
      expect(result.passed).toBe(false);
      expect(result.warnings[0]).toContain('AI pattern');
      expect(result.warnings[0]).toContain(pattern);
    });
  });
});

// ── Format and Length Checks ────────────────────────────────────────────────

describe('checkQuality — format checks', () => {
  it('T8: content that passes all checks returns passed=true', () => {
    const result = checkQuality(GOOD_CONTENT, null);
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('T9: all-punctuation content returns passed=false', () => {
    const result = checkQuality('！？。，', null);
    expect(result.passed).toBe(false);
    expect(result.warnings[0]).toContain('punctuation');
  });

  it('T10: content=null returns passed=false', () => {
    const result = checkQuality(null, null);
    expect(result.passed).toBe(false);
    expect(result.warnings[0]).toContain('Empty or invalid');
  });

  it('T11: maxChars exceeded adds a warning (does not fail)', () => {
    // Generate content longer than maxChars but not triggering other checks
    const longContent = '這係一個測試內容。'.repeat(20); // ~160 chars * repeats
    const result = checkQuality(longContent, null, { maxChars: 10 });
    // Passed may still be true — it's a warning, not a hard fail
    expect(result.warnings.some((w) => w.includes('too long'))).toBe(true);
  });
});

// ── Persona Catchphrase Check ───────────────────────────────────────────────

describe('checkQuality — persona catchphrase', () => {
  it('warns when persona catchphrase not found in content', () => {
    const result = checkQuality(GOOD_CONTENT, { catchphrases: ['大家點睇？'] });
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('No persona catchphrase found in content');
  });

  it('no warning when at least one catchphrase is present', () => {
    const content = GOOD_CONTENT + '大家點睇？';
    const result = checkQuality(content, { catchphrases: ['大家點睇？'] });
    expect(result.passed).toBe(true);
    expect(result.warnings).not.toContain('No persona catchphrase found in content');
  });
});

// ── Similarity Check ─────────────────────────────────────────────────────────

describe('checkSimilarity', () => {
  it('T12: empty recentContents returns isDuplicate=false', () => {
    const result = checkSimilarity('任何內容都好', []);
    expect(result.isDuplicate).toBe(false);
    expect(result.maxSimilarity).toBe(0);
  });

  it('null recentContents returns isDuplicate=false', () => {
    const result = checkSimilarity('任何內容都好', null);
    expect(result.isDuplicate).toBe(false);
    expect(result.maxSimilarity).toBe(0);
  });

  it('nearly identical content detected as duplicate', () => {
    const content = '呢個話題好有趣，我都想分享下自己嘅經驗';
    const result = checkSimilarity(content, ['呢個話題好有趣，我都想分享下自己嘅經驗哦'], 0.8);
    expect(result.isDuplicate).toBe(true);
    expect(result.maxSimilarity).toBeGreaterThanOrEqual(0.8);
  });

  it('completely different content is not duplicate', () => {
    const result = checkSimilarity('今日天氣好好，我出去行吓', ['股市大跌，投資者恐慌'], 0.5);
    expect(result.isDuplicate).toBe(false);
  });

  it('maxSimilarity is rounded to 2 decimal places', () => {
    const content = 'hello world';
    const result = checkSimilarity(content, ['hello world'], 0.99);
    // Exact match → similarity = 1.00
    expect(result.maxSimilarity).toBe(1);
  });
});
