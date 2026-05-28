/**
 * DeepSeek AI Adapter
 * Uses DeepSeek for Tutor conversation and step evaluation
 * Ref: TDG Section 4.3
 */

import OpenAI from 'openai';
import { TUTOR_SYSTEM_PROMPT } from '@/lib/prompts/tutor-system';
import { EVALUATION_SYSTEM_PROMPT, buildEvaluationPrompt as buildEvalPrompt } from '@/lib/prompts/evaluation-system';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// Create DeepSeek client
const deepseek = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
});

// Tutor state types
export type TutorState = 'observe' | 'hint' | 'encourage' | 'simplify' | 'challenge' | 'explain';

// Tutor context for generating responses
export interface TutorContext {
  problemText: string;
  problemType: string | null;
  knowledgePoints: string[];
  tutorState: TutorState;
  hintLevel: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  recentMessages: Array<{
    role: 'student' | 'assistant';
    content: string;
  }>;
  lastEvaluation?: {
    correctness: 'correct' | 'partial' | 'incorrect';
    understandingLevel: string;
    feedback: string;
  };
  userId?: string;
  sessionId?: string;
}

// Tutor response interface
export interface TutorResponse {
  message: string;
  tutorState: TutorState;
  hintLevel: number;
  isComplete: boolean;
}

/**
 * Generate a tutor response using DeepSeek
 */
export async function generateResponse(context: TutorContext): Promise<TutorResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add recent conversation history
    for (const msg of context.recentMessages.slice(-6)) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // Build the current prompt with state-aware guidance
    const statePrompt = buildStatePrompt(context);

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: TUTOR_SYSTEM_PROMPT },
        { role: 'user', content: statePrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: 'Respond as the tutor.' },
      ],
      max_tokens: 512,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    // Check if response violates "no direct answer" rule
    const containsFullSolution = checkForFullSolution(responseText);

    let finalResponse = responseText;
    let isComplete = false;

    if (containsFullSolution && context.consecutiveFailures < 2) {
      // Try once more with explicit warning
      const retryCompletion = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: TUTOR_SYSTEM_PROMPT },
          { role: 'user', content: statePrompt + '\n\nIMPORTANT: Your previous response was too direct. Remember: DO NOT give the complete solution. Ask a guiding question instead.' },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: 'Respond as the tutor with a guiding question, not a solution.' },
        ],
        max_tokens: 512,
      });
      finalResponse = retryCompletion.choices[0]?.message?.content || responseText;
    }

    // Determine if tutoring is complete
    if (finalResponse.includes('明白了') || finalResponse.includes('理解了') || finalResponse.includes('懂了')) {
      if (context.consecutiveSuccesses >= 2) {
        isComplete = true;
      }
    }

    // Calculate next state based on context
    const { tutorState, hintLevel } = calculateNextState(context);

    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: requestId,
      user_id: context.userId || '',
      session_id: context.sessionId || '',
      model_name: 'deepseek-chat',
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      success: true,
      fallback_used: false,
      operation: 'tutor',
    });

    return {
      message: finalResponse,
      tutorState,
      hintLevel,
      isComplete,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: requestId,
      user_id: context.userId || '',
      session_id: context.sessionId || '',
      model_name: 'deepseek-chat',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      fallback_used: false,
      operation: 'tutor',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Generate initial tutor message when session starts
 */
export async function generateInitialMessage(context: TutorContext): Promise<TutorResponse> {
  const initialContext: TutorContext = {
    ...context,
    tutorState: 'hint',
    hintLevel: 1,
    recentMessages: [],
  };

  return generateResponse(initialContext);
}

/**
 * Generate a hint at a specific level
 */
export async function generateHint(context: TutorContext, level: number): Promise<string> {
  const levelHints: Record<number, string> = {
    1: 'Help the student identify the problem type',
    2: 'Help clarify what the problem is asking',
    3: 'Suggest the general approach or method',
    4: 'Guide them to write the first step',
    5: 'Give a partial explanation of the next step',
  };

  const completion = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: TUTOR_SYSTEM_PROMPT },
      { role: 'user', content: `Problem: ${context.problemText}\n\nHint Level ${level}: ${levelHints[level] || 'Provide guidance'}` },
    ],
    max_tokens: 200,
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Build the state-aware prompt
 */
function buildStatePrompt(context: TutorContext): string {
  const stateGuidance: Record<TutorState, string> = {
    observe: 'The student is working through the problem. Provide minimal guidance, mostly listen.',
    hint: 'Provide gentle hints. Ask questions to guide their thinking.',
    encourage: 'The student made progress! Affirm their work and motivate them.',
    simplify: 'Break the problem into smaller steps. Make it easier to approach.',
    challenge: 'The student is doing well. Push them with slightly harder questions.',
    explain: 'ONLY explain if they explicitly asked. Keep it brief and guide them to discover.',
  };

  let prompt = `Problem: ${context.problemText}
Problem Type: ${context.problemType || 'unknown'}
Knowledge Points: ${context.knowledgePoints.join(', ') || 'not specified'}
Current State: ${context.tutorState} (hint level ${context.hintLevel}/5)
Consecutive Failures: ${context.consecutiveFailures}
Consecutive Successes: ${context.consecutiveSuccesses}
`;

  if (context.lastEvaluation) {
    prompt += `\nLast Evaluation: ${context.lastEvaluation.correctness} - ${context.lastEvaluation.feedback}`;
  }

  prompt += `\n\nState Guidance: ${stateGuidance[context.tutorState]}`;

  return prompt;
}

/**
 * Check if response contains a full solution (anti-cheat)
 */
function checkForFullSolution(response: string): boolean {
  const solutionPatterns = [
    /答案[:：]?\s*[\d\-\.]+/,
    /x\s*=\s*[\d\-\.]+/,
    /=\s*[\d\-\.]+\s*$/m,
    /因此.*成立/,
    /所以.*为/,
  ];

  for (const pattern of solutionPatterns) {
    if (pattern.test(response)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate next tutor state based on context
 */
function calculateNextState(context: TutorContext): { tutorState: TutorState; hintLevel: number } {
  let { tutorState, hintLevel } = context;

  if (context.consecutiveFailures >= 3) {
    tutorState = 'explain';
    hintLevel = Math.min(5, context.hintLevel + 1);
  } else if (context.consecutiveFailures >= 2) {
    tutorState = 'simplify';
    hintLevel = Math.min(4, context.hintLevel + 1);
  } else if (context.lastEvaluation?.correctness === 'correct' && context.consecutiveSuccesses >= 2) {
    tutorState = 'challenge';
  } else if (context.lastEvaluation?.correctness === 'partial') {
    tutorState = 'hint';
  } else if (context.consecutiveSuccesses >= 1) {
    tutorState = 'encourage';
  } else {
    tutorState = 'observe';
  }

  if (context.consecutiveSuccesses >= 1 && context.lastEvaluation?.correctness === 'correct') {
    hintLevel = Math.max(1, context.hintLevel - 1);
  }

  return { tutorState, hintLevel };
}

// Evaluation interfaces (per TDG Section 11.1)
export interface EvaluationResult {
  correctness: 'correct' | 'partial' | 'incorrect';
  understandingLevel: 'unknown' | 'confused' | 'partial_understanding' | 'mostly_understood' | 'mastered';
  primaryErrorType: string | null;
  secondaryErrorTypes: string[];
  feedbackSummary: string;
  nextAction: 'continue' | 'hint' | 'simplify' | 'explain';
}

/**
 * Evaluate a student's step input using DeepSeek
 */
export async function evaluateStep(
  sessionId: string,
  studentInput: string,
  problemText: string
): Promise<EvaluationResult> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
        { role: 'user', content: buildEvalPrompt({ problemText, problemType: null, knowledgePoints: [], studentInput }) },
      ],
      max_tokens: 256,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    // Parse JSON response (API returns snake_case)
    let parsed: Record<string, unknown> = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback if JSON parsing fails
    }

    const result: EvaluationResult = {
      correctness: (parsed.correctness as EvaluationResult['correctness']) || 'partial',
      understandingLevel: (parsed.understanding_level as EvaluationResult['understandingLevel']) || 'partial_understanding',
      primaryErrorType: (parsed.primary_error_type as string | null) || null,
      secondaryErrorTypes: (parsed.secondary_error_types as string[]) || [],
      feedbackSummary: ((parsed.feedback_summary as string || parsed.feedbackSummary as string) || '继续努力').substring(0, 20),
      nextAction: (parsed.next_action as EvaluationResult['nextAction']) || 'hint',
    };

    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: requestId,
      user_id: '',
      session_id: sessionId,
      model_name: 'deepseek-chat',
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      success: true,
      fallback_used: false,
      operation: 'evaluation',
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: requestId,
      user_id: '',
      session_id: sessionId,
      model_name: 'deepseek-chat',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      fallback_used: false,
      operation: 'evaluation',
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

// Export singleton
export const deepseekAdapter = {
  generateResponse,
  generateInitialMessage,
  generateHint,
  evaluateStep,
};
