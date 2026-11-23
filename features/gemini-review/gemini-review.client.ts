import {GoogleGenAI, Type} from '@google/genai';
import {getAppConfig} from '../config/env';
import {parseGeminiReviewJson} from './gemini-review.formatter';
import {
  buildReviewUserPrompt,
  ENGINEERING_REVIEW_SYSTEM_PROMPT,
} from './gemini-review.prompt';
import type {
  GeminiReviewGateway,
  GeminiReviewResult,
  ReviewDocumentInput,
} from './gemini-review.types';

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class SdkGeminiReviewClient implements GeminiReviewGateway {
  async reviewDocument(input: ReviewDocumentInput): Promise<GeminiReviewResult> {
    const cfg = getAppConfig();
    if (!cfg.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const ai = createGeminiClient(cfg.geminiApiKey);
    const userPrompt = buildReviewUserPrompt(
      input.projectContext,
      input.keywordType,
      input.fileName
    );

    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: cfg.geminiModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: input.fileUri,
                    mimeType: input.mimeType || 'application/pdf',
                  },
                },
                {
                  text: userPrompt,
                },
              ],
            },
          ],
          config: {
            systemInstruction: ENGINEERING_REVIEW_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                confirmed_flags: {
                  type: Type.ARRAY,
                  items: {type: Type.STRING},
                  description:
                    'Items confirmed incorrect or missing with 100% confidence, in exact input order.',
                },
                unclear: {
                  type: Type.ARRAY,
                  items: {type: Type.STRING},
                  description:
                    'Items requiring double check (<100% confidence), in exact input order.',
                },
                verified_correct: {
                  type: Type.ARRAY,
                  items: {type: Type.STRING},
                  description:
                    'Items verified 100% consistent and correct, in exact input order.',
                },
              },
              required: ['confirmed_flags', 'unclear', 'verified_correct'],
            },
          },
        });

        const rawText = response.text ?? '';
        return parseGeminiReviewJson(rawText);
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const isTransient = /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|timeout/i.test(
          message
        );
        if (isTransient && attempt < maxAttempts) {
          const backoffMs = Math.min(6000, 800 * 2 ** (attempt - 1));
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Gemini review request failed');
  }
}

export const geminiReviewClient = new SdkGeminiReviewClient();
