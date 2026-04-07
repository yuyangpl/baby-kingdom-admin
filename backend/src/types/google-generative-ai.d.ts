declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(config: {
      model: string;
      systemInstruction?: string;
      generationConfig?: Record<string, unknown>;
    }): GenerativeModel;
  }

  interface GenerativeModel {
    generateContent(
      prompt: string | Array<{ text: string }>
    ): Promise<GenerateContentResult>;
  }

  interface GenerateContentResult {
    response: {
      text(): string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };
  }
}
