/**
 * OpenAI Evaluation Adapter
 * Uses GPT-4.1/o4-mini for step evaluation and error classification
 * Ref: TDG Section 4.3, 11.1
 */

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Retry decorator
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
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

// Evaluation input interface
export interface EvaluationInput {
  problemText: string;
  problemType: string | null;
  knowledgePoints: string[];
  studentInput: string;
  tutorState: string;
  previousHints: string[];
  userId?: string;
  sessionId?: string;
}

// Evaluation result interface (per TDG Section 11.1)
export interface EvaluationResult {
  correctness: 'correct' | 'partial' | 'incorrect';
  understanding_level: 'unknown' | 'confused' | 'partial_understanding' | 'mostly_understood' | 'mastered';
  primary_error_type: 'concept_error' | 'reading_error' | 'formula_misuse' | 'step_skip' | 'calculation_error' | 'sign_error' | null;
  secondary_error_types: string[];
  feedback_summary: string; // 20 chars or less
  next_action: 'continue' | 'hint' | 'simplify' | 'explain';
}

// System prompt for structured evaluation
const EVALUATION_SYSTEM_PROMPT = `You are an AI evaluation system for student math responses.

Evaluate each student input and return a STRICT JSON object with exactly these fields:
{
  "correctness": "correct | partial | incorrect",
  "understanding_level": "unknown | confused | partial_understanding | "mostly_understood" | "mastered",
  "primary_error_type": "concept_error | reading_error | formula_misuse | step_skip | calculation_error | sign_error | null",
  "secondary_error_types": [],
  "feedback_summary": "20 characters or less brief review",
  "next_action": "continue | hint | simplify | explain"
}

CRITICAL RULES:
1. Only output valid JSON, nothing else
2. feedback_summary must be 20 characters or less in Chinese
3. Use the exact enum values as specified
4. primary_error_type can be null if no clear error
5. secondary_error_types should contain additional error types if relevant

Error type definitions:
- concept_error: Fundamental concept misunderstanding
- reading_error: Misread the problem or conditions
- formula_misuse: Applied wrong formula or method
- step_skip: Skipped necessary steps
- calculation_error: Arithmetic or calculation mistake
- sign_error: Sign mistakes (+/- confusion)

Next action guidance:
- continue: Student is on track, keep going
- hint: Student needs guidance to proceed
- simplify: Problem is too hard, break it down
- explain: Student needs explicit explanation`;

/**
 * Evaluate a student's step input
 * @param input - EvaluationInput with problem and student response
 * @returns EvaluationResult with structured evaluation
 */
export async function evaluateStep(input: EvaluationInput): Promise<EvaluationResult> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  let modelUsed = 'o4-mini';

  try {
    // Try o4-mini first (faster and cheaper)
    const { text } = await withRetry(async () => {
      return await generateText({
        model: openai('o4-mini'),
        system: EVALUATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildEvaluationPrompt(input) }],
      });
    });

    // Parse JSON response
    let result = parseEvaluationResponse(text) as EvaluationResult;

    // Validate and apply rules if needed
    result = validateAndEnrichResult(result, input);

    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: requestId,
      user_id: input.userId || '',
      session_id: input.sessionId || '',
      model_name: modelUsed,
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: true,
      fallback_used: false,
      operation: 'evaluation',
    });

    return result;
  } catch (_error) {
    // Fall back to GPT-4.1 for complex evaluations
    modelUsed = 'gpt-4.1';
    const startTime2 = Date.now();

    try {
      const { text } = await withRetry(async () => {
        return await generateText({
          model: openai('gpt-4.1'),
          system: EVALUATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildEvaluationPrompt(input) }],
        });
      });

      let result = parseEvaluationResponse(text) as EvaluationResult;
      result = validateAndEnrichResult(result, input);

      const latencyMs = Date.now() - startTime2;
      logModelCall({
        request_id: requestId,
        user_id: input.userId || '',
        session_id: input.sessionId || '',
        model_name: modelUsed,
        latency_ms: latencyMs,
        input_tokens: 0,
        output_tokens: 0,
        success: true,
        fallback_used: true,
        operation: 'evaluation',
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime2;
      logModelCall({
        request_id: requestId,
        user_id: input.userId || '',
        session_id: input.sessionId || '',
        model_name: modelUsed,
        latency_ms: latencyMs,
        input_tokens: 0,
        output_tokens: 0,
        success: false,
        fallback_used: true,
        operation: 'evaluation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}

/**
 * Build the evaluation prompt
 */
function buildEvaluationPrompt(input: EvaluationInput): string {
  return `Problem: ${input.problemText}
Problem Type: ${input.problemType || 'unknown'}
Knowledge Points: ${input.knowledgePoints.join(', ') || 'not specified'}
Tutor State: ${input.tutorState}
Previous Hints: ${input.previousHints.length > 0 ? input.previousHints.join('; ') : 'none'}

Student Input: ${input.studentInput}

Evaluate the student's input and return JSON.`;
}

/**
 * Parse the evaluation response, with fallback for non-JSON responses
 */
function parseEvaluationResponse(responseText: string): Partial<EvaluationResult> {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through to default
  }

  // If parsing fails, return unknown result
  return {
    correctness: 'incorrect',
    understanding_level: 'unknown',
    primary_error_type: null,
    secondary_error_types: [],
    feedback_summary: '评估失败',
    next_action: 'hint',
  };
}

/**
 * Validate and enrich the evaluation result with rules per TDG Section 11.3
 */
function validateAndEnrichResult(
  result: Partial<EvaluationResult>,
  input: EvaluationInput
): EvaluationResult {
  const validated: EvaluationResult = {
    correctness: result.correctness || 'incorrect',
    understanding_level: result.understanding_level || 'confused',
    primary_error_type: result.primary_error_type || null,
    secondary_error_types: result.secondary_error_types || [],
    feedback_summary: (result.feedback_summary || '继续努力').slice(0, 20),
    next_action: result.next_action || 'hint',
  };

  // Rule-based error classification fallback (TDG Section 11.4)
  if (!validated.primary_error_type) {
    validated.primary_error_type = classifyErrorFromInput(input.studentInput);
  }

  // Ensure feedback_summary is within 20 characters
  validated.feedback_summary = validated.feedback_summary.slice(0, 20);

  return validated;
}

/**
 * Classify error type from student input using rules (TDG Section 11.4)
 */
function classifyErrorFromInput(studentInput: string): EvaluationResult['primary_error_type'] {
  // Check for sign errors
  if (/[+\-][+\-]/.test(studentInput) || /[+\-]\s*[+\-]/.test(studentInput)) {
    return 'sign_error';
  }

  // Check for step skip patterns
  if (/=\s*=.*=/.test(studentInput) || /(\w+)\s*=\s*\1/.test(studentInput)) {
    return 'step_skip';
  }

  // Check for calculation errors (basic patterns)
  if (/\d+\s*[+\-*/]\s*\d+\s*=\s*\d+/.test(studentInput)) {
    return 'calculation_error';
  }

  // Check for formula misuse
  if (/（/.test(studentInput) && /）/g.test(studentInput) && /[a-zA-Z]/.test(studentInput)) {
    return 'formula_misuse';
  }

  // Default to concept error
  return 'concept_error';
}

// OpenAI Adapter class
export class OpenAIAdapter {
  /**
   * Generate a response with prompt
   */
  async generateResponse(prompt: string): Promise<string> {
    const { text } = await generateText({
      model: openai('o4-mini'),
      messages: [{ role: 'user', content: prompt }],
    });
    return text;
  }

  /**
   * Evaluate a step with full input
   */
  async evaluateStep(input: EvaluationInput): Promise<EvaluationResult> {
    return evaluateStep(input);
  }

  /**
   * Generate with context
   */
  async generateWithContext(context: string): Promise<string> {
    return this.generateResponse(context);
  }
}

export const openaiAdapter = new OpenAIAdapter();

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