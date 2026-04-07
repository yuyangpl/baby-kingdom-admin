import logger from '../../shared/logger.js';

const AI_PATTERNS = [
  '作为一个ai', '作為一個ai', '我是语言模型', '我是語言模型',
  'as an ai', 'i am a language model', 'i cannot',
];

interface QualityResult {
  passed: boolean;
  warnings: string[];
}

interface QualityOptions {
  minChars?: number;
  maxChars?: number;
}

interface PersonaLike {
  catchphrases?: string[];
}

/**
 * Check AI-generated content for quality issues.
 * Returns { passed, warnings[] }.
 */
export function checkQuality(content: string | null | undefined, persona?: PersonaLike | null, options: QualityOptions = {}): QualityResult {
  const warnings: string[] = [];
  const { minChars = 30, maxChars = 600 } = options;

  if (!content || typeof content !== 'string') {
    return { passed: false, warnings: ['Empty or invalid content'] };
  }

  const trimmed = content.trim();

  // Format check: empty, all punctuation, garbled
  if (trimmed.length === 0) {
    return { passed: false, warnings: ['Content is empty'] };
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) {
    return { passed: false, warnings: ['Content is all punctuation/symbols'] };
  }

  // Length check
  if (trimmed.length < minChars) {
    warnings.push(`Content too short (${trimmed.length} < ${minChars} chars)`);
  }

  if (trimmed.length > maxChars) {
    warnings.push(`Content too long (${trimmed.length} > ${maxChars} chars)`);
  }

  // AI pattern check
  const contentLower = trimmed.toLowerCase();
  for (const pattern of AI_PATTERNS) {
    if (contentLower.includes(pattern)) {
      return { passed: false, warnings: [`Contains AI pattern: "${pattern}"`] };
    }
  }

  // Catchphrase check (informational, not blocking)
  if (persona?.catchphrases?.length) {
    const hasCatchphrase = persona.catchphrases.some((cp) =>
      trimmed.includes(cp)
    );
    if (!hasCatchphrase) {
      warnings.push('No persona catchphrase found in content');
    }
  }

  return { passed: true, warnings };
}

interface SimilarityResult {
  isDuplicate: boolean;
  maxSimilarity: number;
}

/**
 * Check content similarity against recent feeds.
 * Simple character-level Jaccard similarity.
 */
export function checkSimilarity(content: string | null | undefined, recentContents: string[] | undefined, threshold = 0.85): SimilarityResult {
  if (!content || !recentContents?.length) return { isDuplicate: false, maxSimilarity: 0 };

  const contentSet = new Set(content.split(''));
  let maxSimilarity = 0;

  for (const recent of recentContents) {
    const recentSet = new Set(recent.split(''));
    const intersection = new Set([...contentSet].filter((c) => recentSet.has(c)));
    const union = new Set([...contentSet, ...recentSet]);
    const similarity = intersection.size / union.size;

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
  }

  return {
    isDuplicate: maxSimilarity >= threshold,
    maxSimilarity: Math.round(maxSimilarity * 100) / 100,
  };
}
