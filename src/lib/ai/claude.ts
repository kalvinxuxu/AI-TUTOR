/**
 * Claude Tutor Adapter
 * Uses Claude Sonnet for Socratic guidance and multi-turn teaching
 * Ref: TDG Section 4.3, 10.4
 */

import { anthropic } from '@ai-sdk/anthropic';
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

// System prompt for Socratic tutoring
const TUTOR_SYSTEM_PROMPT = `You are an AI math tutor helping a student learn through Socratic questioning.
Your primary goal is to guide the student to discover answers themselves rather than giving direct solutions.

CRITICAL RULES (never violate these):
1. NEVER give complete answers or full solutions directly
2. Each response should advance only ONE small step
3. PRIORITIZE questions over explanations
4. First affirm what the student did correctly, THEN correct mistakes gently
5. When a student is stuck for multiple turns, you MAY simplify the problem
6. Keep responses concise - aim for 2-4 sentences maximum
7. Use encouraging language, never discourage

TUTOR STATE GUIDANCE:
- "observe": Watch and listen, minimal prompts
- "hint": Provide gentle guidance, ask clarifying questions
- "encourage": Affirm progress, motivate continued effort
- "simplify": Break down into smaller, easier steps
- "challenge": Push student with slightly harder questions when ready
- "explain": ONLY use when student explicitly asks or gives up

RESPONSE FORMAT:
Stay in character as a encouraging tutor. Use questions to guide.
Example good responses:
- "Great start! You correctly identified the variable. Now, what comes next in this type of equation?"
- "I see you multiplied both sides. What's the next step to isolate x?"
- "You're on the right track. Let me ask: what does a negative coefficient mean for the slope direction?"`;

/**
 * Generate a tutor response based on context
 * @param context - The tutor context with problem info and conversation history
 * @returns TutorResponse with message, state, and hint level
 */
export async function generateResponse(context: TutorContext): Promise<TutorResponse> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Build messages for context
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

    const { text: responseText } = await withRetry(async () => {
      return await generateText({
        model: anthropic('claude-sonnet-4-20250514'),
        system: TUTOR_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: statePrompt },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: 'Respond as the tutor.' },
        ],
        maxOutputTokens: 512,
      });
    });

    // Check if response violates "no direct answer" rule
    const containsFullSolution = checkForFullSolution(responseText);

    let finalResponse = responseText;
    let isComplete = false;

    if (containsFullSolution && context.consecutiveFailures < 2) {
      // Try once more with explicit warning
      const { text: retryText } = await generateText({
        model: anthropic('claude-sonnet-4-20250514'),
        system: TUTOR_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: statePrompt + '\n\nIMPORTANT: Your previous response was too direct. Remember: DO NOT give the complete solution. Ask a guiding question instead.' },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: 'Respond as the tutor with a guiding question, not a solution.' },
        ],
        maxOutputTokens: 512,
      });
      finalResponse = retryText;
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
      model_name: 'claude-sonnet-4',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
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
      model_name: 'claude-sonnet-4',
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
  // Simple heuristic - if response contains solution-like patterns
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

  // State transition rules per TDG Section 10.2
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

  // Decrease hint level on success
  if (context.consecutiveSuccesses >= 1 && context.lastEvaluation?.correctness === 'correct') {
    hintLevel = Math.max(1, context.hintLevel - 1);
  }

  return { tutorState, hintLevel };
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
export async function generateHint(
  context: TutorContext,
  level: number
): Promise<string> {
  const levelHints: Record<number, string> = {
    1: 'Help the student identify the problem type',
    2: 'Help clarify what the problem is asking',
    3: 'Suggest the general approach or method',
    4: 'Guide them to write the first step',
    5: 'Give a partial explanation of the next step',
  };

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: TUTOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Problem: ${context.problemText}\n\nHint Level ${level}: ${levelHints[level] || 'Provide guidance'}` },
    ],
    maxOutputTokens: 200,
  });

  return text;
}

// Claude Adapter class
export class ClaudeAdapter {
  /**
   * Generate a response with context
   */
  async generateResponse(prompt: string): Promise<string> {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      messages: [{ role: 'user', content: prompt }],
    });
    return text;
  }

  /**
   * Generate with full context
   */
  async generateWithContext(context: TutorContext): Promise<TutorResponse> {
    return generateResponse(context);
  }
}

export const claudeAdapter = new ClaudeAdapter();

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