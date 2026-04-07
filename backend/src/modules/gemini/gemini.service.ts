import * as configService from '../config/config.service.js';
import logger from '../../shared/logger.js';

interface GeminiOptions {
  json?: boolean;
}

interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
}

interface GeminiResult {
  text: any;
  usage: GeminiUsage;
}

/**
 * Call Gemini API to generate content.
 * Uses @google/generative-ai SDK when available, falls back to mock in dev/test.
 */
export async function callGemini(systemPrompt: string, userPrompt: string, options: GeminiOptions = {}): Promise<GeminiResult> {
  const model = await configService.getValue('GEMINI_MODEL') || 'gemini-2.5-flash';
  const temperature = parseFloat(await configService.getValue('GEMINI_TEMPERATURE') || '0.85');
  const maxTokens = parseInt(await configService.getValue('GEMINI_MAX_OUTPUT_TOKENS') || '800', 10);
  const apiKey = await configService.getValue('GEMINI_API_KEY');

  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not configured, using mock response');
    return mockGeminiResponse(userPrompt, options);
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: options.json ? 'application/json' : 'text/plain',
      },
    });

    const result = await genModel.generateContent(userPrompt);
    const text = result.response.text();
    const usage = result.response.usageMetadata || {};

    return {
      text: options.json ? JSON.parse(text) : text,
      usage: {
        inputTokens: (usage as any).promptTokenCount || 0,
        outputTokens: (usage as any).candidatesTokenCount || 0,
      },
    };
  } catch (err) {
    logger.error({ err }, 'Gemini API call failed');
    throw err;
  }
}

function mockGeminiResponse(userPrompt: string, options: GeminiOptions): GeminiResult {
  if (options.json) {
    return {
      text: {
        relevanceScore: 75,
        worthReplying: true,
        topic: 'Mock topic',
        tier: 'Tier 1 — Safe',
        toneMode: 'CASUAL',
        sentimentScore: 80,
        replyText: '呢個話題好有趣，我都想分享下自己嘅經驗…',
        reasoning: 'Mock evaluation',
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }
  return {
    text: '呢個話題好有趣，我都想分享下自己嘅經驗…',
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}
