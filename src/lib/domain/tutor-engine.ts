/**
 * Tutor Engine
 * State machine for AI-driven tutoring with Socratic methodology
 * Ref: TDG Section 6 (Tutor Engine), 10.1, 10.2, 10.3
 */

import { TutorState, TutorContext, TutorResponse, Correctness, UnderstandingLevel } from '@/types/domain';
import { generateResponse, generateInitialMessage, generateHint } from '@/lib/ai/claude';

/**
 * Hint level definitions per TDG Section 10.3
 */
export const HINT_LEVELS = {
  1: {
    type: 'identify_problem_type',
    description: 'Identify problem type',
    example: 'Is this more like an equation, function or geometry problem?',
  },
  2: {
    type: 'clarify_conditions',
    description: 'Clarify conditions',
    example: 'What conditions does the problem give, what is it asking for?',
  },
  3: {
    type: 'hint_at_method',
    description: 'Hint at method',
    example: 'For this type of problem, do you usually list the formula first or find relationships first?',
  },
  4: {
    type: 'hint_at_first_step',
    description: 'Hint at first step',
    example: 'Try writing out the first step.',
  },
  5: {
    type: 'partial_explanation',
    description: 'Partial explanation',
    example: 'Earlier you should use this relationship first, then continue.',
  },
} as const;

/**
 * State transition rules per TDG Section 10.2
 * if action == see_solution -> explain
 * if consecutive_failures >= 2 -> simplify
 * if consecutive_failures >= 3 -> explain
 * if correctness == correct and understanding == mostly_understood -> challenge
 * if correctness == partial -> hint
 * else -> observe
 */

/**
 * Determine next tutor state based on evaluation results and session history
 * @param context - Current tutor context
 * @param action - Optional action override (e.g., 'see_solution')
 * @returns Next tutor state and hint level
 */
export function determineNextState(
  context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'>,
  action?: string
): { tutorState: TutorState; hintLevel: number } {
  // Explicit action overrides
  if (action === 'see_solution') {
    return { tutorState: 'explain', hintLevel: 5 };
  }

  // Consecutive failure rules (higher priority)
  if (context.consecutiveFailures >= 3) {
    return { tutorState: 'explain', hintLevel: Math.min(5, context.lastEvaluation?.correctness ? 4 : 5) };
  }

  if (context.consecutiveFailures >= 2) {
    return { tutorState: 'simplify', hintLevel: Math.min(4, context.lastEvaluation?.correctness ? 3 : 4) };
  }

  // Evaluation-based rules
  if (context.lastEvaluation) {
    const { correctness, understandingLevel } = context.lastEvaluation;

    if (correctness === 'correct' && understandingLevel === 'mostly_understood') {
      return { tutorState: 'challenge', hintLevel: context.hintLevel };
    }

    if (correctness === 'partial') {
      return { tutorState: 'hint', hintLevel: Math.min(4, context.hintLevel + 1) };
    }

    if (correctness === 'incorrect' && context.consecutiveFailures === 1) {
      return { tutorState: 'hint', hintLevel: Math.min(3, context.hintLevel + 1) };
    }
  }

  // Success-based encouragement
  if (context.consecutiveSuccesses >= 2) {
    return { tutorState: 'challenge', hintLevel: Math.max(1, context.hintLevel - 1) };
  }

  if (context.consecutiveSuccesses >= 1) {
    return { tutorState: 'encourage', hintLevel: context.hintLevel };
  }

  // Default state
  return { tutorState: 'observe', hintLevel: Math.max(1, context.hintLevel - 1) };
}

/**
 * Build a complete tutor prompt with state-aware guidance
 * @param context - Full tutor context
 * @returns Formatted prompt string
 */
export function buildTutorPrompt(context: TutorContext): string {
  const stateGuidance: Record<TutorState, string> = {
    observe: 'The student is working through the problem. Provide minimal guidance, mostly listen and observe.',
    hint: 'Provide gentle hints. Ask questions to guide their thinking without giving answers.',
    encourage: 'The student made progress! Affirm their work and motivate them to continue.',
    simplify: 'Break the problem into smaller steps. Make it easier to approach by simplifying the approach.',
    challenge: 'The student is doing well. Push them with slightly harder questions or alternative perspectives.',
    explain: 'ONLY explain if they explicitly asked for help or have failed multiple times. Keep it brief and guide them to discover.',
  };

  const hintGuidance = HINT_LEVELS[context.hintLevel as keyof typeof HINT_LEVELS];

  let prompt = `## Current Problem
${context.problemText}

**Problem Type:** ${context.problemType || 'unknown'}
**Knowledge Points:** ${context.knowledgePoints.join(', ') || 'not specified'}

## Session State
- **Tutor State:** ${context.tutorState} (hint level ${context.hintLevel}/5 - ${hintGuidance.description})
- **Consecutive Failures:** ${context.consecutiveFailures}
- **Consecutive Successes:** ${context.consecutiveSuccesses}
`;

  if (context.lastEvaluation) {
    prompt += `
## Last Evaluation
- **Correctness:** ${context.lastEvaluation.correctness}
- **Understanding:** ${context.lastEvaluation.understandingLevel}
- **Feedback:** ${context.lastEvaluation.feedback}
`;
  }

  prompt += `
## State Guidance
${stateGuidance[context.tutorState]}

## Critical Rules
1. NEVER give complete answers or full solutions
2. Each response should advance only ONE small step
3. PRIORITIZE questions over explanations
4. Keep responses concise - 2-4 sentences maximum
5. Use encouraging language, never discourage

## Recent Conversation
`;

  for (const msg of context.recentMessages.slice(-6)) {
    const roleLabel = msg.role === 'assistant' ? 'Tutor' : 'Student';
    prompt += `- ${roleLabel}: ${msg.content}\n`;
  }

  return prompt;
}

/**
 * Check if response contains a full solution (anti-cheat)
 * @param response - Tutor response text
 * @returns True if contains full solution
 */
export function containsFullSolution(response: string): boolean {
  const solutionPatterns = [
    /答案[:：]?\s*[\d\-\.]+/,
    /x\s*=\s*[\d\-\.]+/,
    /=\s*[\d\-\.]+\s*$/m,
    /因此.*成立/,
    /所以.*为/,
    /求解完成/,
    /解得/,
  ];

  for (const pattern of solutionPatterns) {
    if (pattern.test(response)) {
      return true;
    }
  }

  return false;
}

/**
 * Main tutor engine class
 */
export class TutorEngine {
  private context: TutorContext | null = null;

  /**
   * Start a new tutoring session
   * @param problemText - The problem text
   * @param problemType - Optional problem type
   * @param knowledgePoints - Array of knowledge points
   * @param userId - User ID
   * @param sessionId - Session ID
   */
  async startSession(
    problemText: string,
    problemType: string | null,
    knowledgePoints: string[],
    userId: string,
    sessionId: string
  ): Promise<TutorResponse> {
    this.context = {
      problemText,
      problemType,
      knowledgePoints,
      tutorState: 'hint',
      hintLevel: 1,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      recentMessages: [],
      userId,
      sessionId,
    };

    return generateInitialMessage(this.context);
  }

  /**
   * Generate response for student input
   * @param studentInput - Student's response
   * @returns Tutor response with state information
   */
  async generateResponse(studentInput: string): Promise<TutorResponse> {
    if (!this.context) {
      throw new Error('Tutor session not initialized. Call startSession first.');
    }

    // Add student message to history
    this.context.recentMessages.push({
      role: 'student',
      content: studentInput,
    });

    // Limit history to last 20 messages
    if (this.context.recentMessages.length > 20) {
      this.context.recentMessages = this.context.recentMessages.slice(-20);
    }

    // Generate response
    const response = await generateResponse(this.context);

    // Update context with new state
    this.context.tutorState = response.tutorState;
    this.context.hintLevel = response.hintLevel;

    // Add tutor response to history
    this.context.recentMessages.push({
      role: 'assistant',
      content: response.message,
    });

    return response;
  }

  /**
   * Update context after evaluation
   * @param correctness - Evaluation correctness
   * @param understandingLevel - Student understanding
   * @param feedback - Evaluation feedback
   */
  updateAfterEvaluation(
    correctness: Correctness,
    understandingLevel: UnderstandingLevel,
    feedback: string
  ): void {
    if (!this.context) return;

    this.context.lastEvaluation = { correctness, understandingLevel, feedback };

    // Update consecutive counters
    if (correctness === 'incorrect') {
      this.context.consecutiveFailures += 1;
      this.context.consecutiveSuccesses = 0;
    } else if (correctness === 'correct') {
      this.context.consecutiveSuccesses += 1;
      this.context.consecutiveFailures = 0;
    } else {
      // partial - reset both
      this.context.consecutiveFailures = 0;
      this.context.consecutiveSuccesses = 0;
    }

    // Calculate next state
    const { tutorState, hintLevel } = determineNextState(this.context);
    this.context.tutorState = tutorState;
    this.context.hintLevel = hintLevel;
  }

  /**
   * Get current context
   */
  getContext(): TutorContext | null {
    return this.context;
  }

  /**
   * Generate a specific level hint
   * @param level - Hint level (1-5)
   */
  async generateHintAtLevel(level: number): Promise<string> {
    if (!this.context) {
      throw new Error('Tutor session not initialized');
    }

    return generateHint(this.context, level);
  }

  /**
   * Handle solution reveal request
   */
  async revealSolution(): Promise<TutorResponse> {
    if (!this.context) {
      throw new Error('Tutor session not initialized');
    }

    // Force explain state
    this.context.tutorState = 'explain';
    this.context.hintLevel = 5;
    this.context.lastEvaluation = {
      correctness: 'incorrect',
      understandingLevel: 'unknown',
      feedback: 'Student requested solution',
    };

    return generateResponse(this.context);
  }
}

// Singleton instance
export const tutorEngine = new TutorEngine();