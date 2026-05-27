/**
 * Gemini OCR Adapter
 * Uses Gemini 2.5 Flash for problem text extraction and knowledge point identification
 * Ref: TDG Section 4.3, 10.4
 */

import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// Retry decorator
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  retryDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * retryDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// OCR Result interface
export interface OCRResult {
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  confidence: number;
  rawExtraction?: string;
}

/**
 * Extract problem text from an image URL using Gemini 2.5 Flash
 * @param imageUrl - URL of the problem image
 * @returns OCRResult with normalized text, problem type, knowledge points, and confidence
 */
export async function extractProblemText(imageUrl: string): Promise<OCRResult> {
  const startTime = Date.now();
  let fallbackUsed = false;

  try {
    const { text } = await withRetry(async () => {
      return await generateText({
        model: google('gemini-2.5-flash'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are an OCR system for extracting math problem text.
Given an image of a math problem, extract the text content and identify:
1. The normalized problem text
2. The problem type (e.g., "equation", "geometry", "word_problem", "algebra", etc.)
3. Key knowledge points (array of strings)
4. Confidence score (0-1)

Return your response as a JSON object with these fields:
{
  "normalizedText": "the extracted problem text",
  "problemType": "the problem type or null if unclear",
  "knowledgePoints": ["point1", "point2", ...],
  "confidence": 0.0-1.0,
  "rawExtraction": "original extracted text if different from normalized"
}

Only respond with valid JSON, no additional text.`
              },
              {
                type: 'image',
                image: imageUrl
              }
            ],
          },
        ],
      });
    });

    let parsed: Partial<OCRResult> = {};

    try {
      // Try to parse as JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, extract text content
      parsed.normalizedText = text;
      parsed.confidence = 0.5;
      fallbackUsed = true;
    }

    const result: OCRResult = {
      normalizedText: parsed.normalizedText || text,
      problemType: parsed.problemType || null,
      knowledgePoints: parsed.knowledgePoints || [],
      confidence: parsed.confidence || 0.7,
      rawExtraction: parsed.rawExtraction,
    };

    // Log the call for instrumentation
    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'gemini-2.5-flash',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: true,
      fallback_used: fallbackUsed,
      operation: 'ocr',
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Log failed call
    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'gemini-2.5-flash',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      fallback_used: fallbackUsed,
      operation: 'ocr',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Extract problem text from base64 encoded image
 * @param base64Image - Base64 encoded image data
 * @param mimeType - MIME type of the image
 * @returns OCRResult
 */
export async function extractProblemTextFromBase64(
  base64Image: string,
  mimeType: string = 'image/png'
): Promise<OCRResult> {
  const startTime = Date.now();
  let fallbackUsed = false;

  try {
    const { text } = await withRetry(async () => {
      return await generateText({
        model: google('gemini-2.5-flash'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are an OCR system for extracting math problem text.
Given an image of a math problem, extract the text content and identify:
1. The normalized problem text
2. The problem type (e.g., "equation", "geometry", "word_problem", "algebra", etc.)
3. Key knowledge points (array of strings)
4. Confidence score (0-1)

Return your response as a JSON object with these fields:
{
  "normalizedText": "the extracted problem text",
  "problemType": "the problem type or null if unclear",
  "knowledgePoints": ["point1", "point2", ...],
  "confidence": 0.0-1.0
}

Only respond with valid JSON, no additional text.`
              },
              {
                type: 'image',
                image: `data:${mimeType};base64,${base64Image}`
              }
            ],
          },
        ],
      });
    });

    let parsed: Partial<OCRResult> = {};

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      parsed.normalizedText = text;
      parsed.confidence = 0.5;
      fallbackUsed = true;
    }

    const result: OCRResult = {
      normalizedText: parsed.normalizedText || text,
      problemType: parsed.problemType || null,
      knowledgePoints: parsed.knowledgePoints || [],
      confidence: parsed.confidence || 0.7,
    };

    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'gemini-2.5-flash',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: true,
      fallback_used: fallbackUsed,
      operation: 'ocr',
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'gemini-2.5-flash',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      fallback_used: fallbackUsed,
      operation: 'ocr',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

// Logging function
function logModelCall(call: ModelCallLog): void {
  const logEntry: ModelCallLog = {
    ...call,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    console.log(`[AI Call] ${logEntry.model_name} | ${logEntry.operation} | ${logEntry.latency_ms}ms | ${logEntry.success ? 'OK' : 'FAIL'}${logEntry.fallback_used ? ' (fallback)' : ''}`);
    if (logEntry.error) {
      console.error(`[AI Error] ${logEntry.error}`);
    }
  }
}

// Gemini Adapter class
export class GeminiAdapter {
  /**
   * Generate a response with custom prompt
   * @param prompt - The prompt to send to Gemini
   */
  async generateResponse(prompt: string): Promise<string> {
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      messages: [{ role: 'user', content: prompt }],
    });
    return text;
  }

  /**
   * Generate with image input
   * @param prompt - Text prompt
   * @param imageUrl - URL or base64 image
   */
  async generateWithImage(prompt: string, imageUrl: string): Promise<string> {
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: imageUrl },
          ],
        },
      ],
    });
    return text;
  }
}

export const geminiAdapter = new GeminiAdapter();

/**
 * Stub type for model call logging
 */
interface ModelCallLog {
  request_id: string;
  user_id: string;
  session_id: string;
  model_name: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  success: boolean;
  fallback_used: boolean;
  operation: string;
  error?: string;
  timestamp?: string;
}