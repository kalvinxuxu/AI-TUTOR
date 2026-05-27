/**
 * Evaluation Service
 * Handles step evaluation using structured evaluation model
 * Ref: TDG Section 6 (Evaluation Service), 11.1
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StepEvaluation,
  EvaluationResult,
  Correctness,
  UnderstandingLevel,
  ErrorType,
  NextAction,
} from '@/types/domain';
import { supabase } from '@/lib/supabase/client';
import { EVALUATION_SYSTEM_PROMPT } from '@/lib/prompts/evaluation-system';

/**
 * Evaluation service for analyzing student responses
 */
export class EvaluationService {
  /**
   * Evaluate a student input against the problem
   * @param sessionId - Session ID
   * @param studentInput - The student's response
   * @param problemText - The problem text for context
   * @returns EvaluationResult with correctness, understanding, error types, and next action
   */
  async evaluateStep(
    sessionId: string,
    studentInput: string,
    problemText: string
  ): Promise<EvaluationResult> {
    const evaluation = await callEvaluationModel(studentInput, problemText);

    // Persist evaluation record
    await this.persistEvaluation(sessionId, studentInput, evaluation);

    return evaluation;
  }

  /**
   * Persist evaluation to database
   */
  private async persistEvaluation(
    sessionId: string,
    studentInput: string,
    evaluation: EvaluationResult
  ): Promise<void> {
    if (!supabase) return;

    const evaluationId = uuidv4();
    const now = new Date();

    await supabase.from('step_evaluations').insert({
      id: evaluationId,
      session_id: sessionId,
      message_id: null, // Will be linked later
      student_input: studentInput,
      correctness: evaluation.correctness,
      understanding_level: evaluation.understandingLevel,
      primary_error_type: evaluation.primaryErrorType,
      secondary_error_types: evaluation.secondaryErrorTypes,
      feedback: evaluation.feedbackSummary,
      next_action: evaluation.nextAction,
      created_at: now.toISOString(),
    });
  }

  /**
   * Get evaluation history for a session
   * @param sessionId - Session ID
   * @returns Array of StepEvaluation records
   */
  async getEvaluationHistory(sessionId: string): Promise<StepEvaluation[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('step_evaluations')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      messageId: row.message_id,
      studentInput: row.student_input,
      correctness: row.correctness as Correctness,
      understandingLevel: row.understanding_level as UnderstandingLevel,
      primaryErrorType: row.primary_error_type as ErrorType | null,
      secondaryErrorTypes: row.secondary_error_types as ErrorType[],
      feedback: row.feedback,
      nextAction: row.next_action as NextAction,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Generate a short feedback message based on evaluation
   * @param evaluation - Evaluation result
   * @returns Brief feedback string
   */
  generateFeedback(evaluation: EvaluationResult): string {
    const feedbackTemplates: Record<Correctness, Record<UnderstandingLevel, string>> = {
      correct: {
        unknown: '很好，继续！',
        confused: '不错，你正在进步！',
        partial_understanding: '正确，继续下一个步骤！',
        mostly_understood: '完全正确，很棒！',
        mastered: '完美！你已经完全掌握了！',
      },
      partial: {
        unknown: '有进展，再想想看。',
        confused: '接近了，再检查一下。',
        partial_understanding: '部分正确，继续努力。',
        mostly_understood: '基本正确，再完善一下。',
        mastered: '很好，只差一点点了！',
      },
      incorrect: {
        unknown: '再想想，尝试另一种方法。',
        confused: '没关系，让我们理清思路。',
        partial_understanding: '方向对 了，但需要调整。',
        mostly_understood: '有点小错误，检查一下。',
        mastered: '再仔细想想，你很接近了！',
      },
    };

    return feedbackTemplates[evaluation.correctness][evaluation.understandingLevel];
  }
}

/**
 * Call the evaluation model (Claude) for structured evaluation
 * Returns parsed EvaluationResult
 */
async function callEvaluationModel(
  studentInput: string,
  problemText: string
): Promise<EvaluationResult> {
  // Dynamic import to avoid circular dependency issues
  const { generateText } = await import('ai');
  const { anthropic } = await import('@ai-sdk/anthropic');

  const prompt = buildEvaluationPrompt(studentInput, problemText);

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: EVALUATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxOutputTokens: 256,
  });

  // Parse JSON response
  let parsed: Partial<EvaluationResult> = {};

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fallback if JSON parsing fails
    return {
      correctness: 'partial' as Correctness,
      understandingLevel: 'partial_understanding' as UnderstandingLevel,
      primaryErrorType: null,
      secondaryErrorTypes: [],
      feedbackSummary: '需要更多反馈',
      nextAction: 'hint' as NextAction,
    };
  }

  return {
    correctness: (parsed.correctness as Correctness) || 'partial',
    understandingLevel: (parsed.understandingLevel as UnderstandingLevel) || 'partial_understanding',
    primaryErrorType: parsed.primaryErrorType as ErrorType | null,
    secondaryErrorTypes: (parsed.secondaryErrorTypes as ErrorType[]) || [],
    feedbackSummary: (parsed.feedbackSummary || '继续努力').substring(0, 20),
    nextAction: (parsed.nextAction as NextAction) || 'hint',
  };
}

/**
 * Build evaluation prompt with context
 */
function buildEvaluationPrompt(studentInput: string, problemText: string): string {
  return `## Student Response
${studentInput}

## Problem Context
${problemText}

## Task
Evaluate the student response and return a JSON object with:
- "correctness": "correct" | "partial" | "incorrect"
- "understanding_level": "unknown" | "confused" | "partial_understanding" | "mostly_understood" | "mastered"
- "primary_error_type": "concept_error" | "reading_error" | "formula_misuse" | "step_skip" | "calculation_error" | "sign_error" | null
- "secondary_error_types": array of additional error types
- "feedback_summary": brief feedback in Chinese (20 characters or less)
- "next_action": "continue" | "hint" | "simplify" | "explain"

Only respond with valid JSON.`;
}

// Singleton instance
export const evaluationService = new EvaluationService();

/**
 * Classify error based on student input patterns
 * Per TDG Section 11.4 - Error Classification Rules
 * @param studentInput - The student's response
 * @param modelErrorType - Error type from evaluation model (optional)
 * @returns Classified ErrorType
 */
export function classifyError(studentInput: string, modelErrorType: ErrorType | null): ErrorType {
  // If model returns valid error type, use it
  if (modelErrorType) {
    return modelErrorType;
  }

  const input = studentInput.toLowerCase();

  // Basic arithmetic errors - check BEFORE sign errors (more specific patterns)
  if (
    input.includes('arithmetic') ||
    input.includes('calculate') ||
    /[0-9]+\s*[+\-*/]\s*[0-9]+\s*=\s*[0-9]+/.test(input) ||
    input.includes('addition') ||
    input.includes('subtraction') ||
    input.includes('multiplication') ||
    input.includes('division')
  ) {
    return 'calculation_error';
  }

  // Bracket errors / sign errors
  if (
    input.includes('bracket') ||
    input.includes('sign') ||
    /[+\-][^0-9]/.test(input) ||
    (input.includes('move') && input.includes('term'))
  ) {
    return 'sign_error';
  }

  // Skipping middle derivation / step_skip
  if (
    input.includes('skip') ||
    input.includes('jump') ||
    input.includes('miss') ||
    /->.*->/.test(input) ||
    (input.includes('directly') && input.includes('answer'))
  ) {
    return 'step_skip';
  }

  // Default to concept_error
  return 'concept_error';
}