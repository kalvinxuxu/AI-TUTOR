/**
 * Evaluation System Prompt
 * Ref: TDG Section 11
 *
 * Evaluates student math responses and returns structured JSON with feedback.
 * Handles error classification, feedback assembly, and rule-based fallbacks.
 */

import { ErrorType, Correctness, UnderstandingLevel, NextAction } from '@/types/domain';

/**
 * Evaluation System Prompt Template
 * Structured output for evaluating student responses in math tutoring
 */
export const EVALUATION_SYSTEM_PROMPT = `You are an AI evaluation system for student math responses in a Socratic tutoring session.
Your task is to analyze each student input and provide structured feedback that helps the tutor
guide the student effectively.

## JSON OUTPUT SCHEMA (TDG Section 11.1)

You MUST return a STRICT JSON object with exactly these fields:

{
  "correctness": "correct | partial | incorrect",
  "understanding_level": "unknown | confused | partial_understanding | mostly_understood | mastered",
  "primary_error_type": "concept_error | reading_error | formula_misuse | step_skip | calculation_error | sign_error | null",
  "secondary_error_types": [],
  "feedback_summary": "20 characters or less brief review in Chinese",
  "next_action": "continue | hint | simplify | explain"
}

## FIELD DEFINITIONS

### correctness
- **correct**: Student response is accurate and complete for the current step
- **partial**: Student response has some correct elements but is incomplete or has minor errors
- **incorrect**: Student response has significant errors or is off-track

### understanding_level
- **unknown**: Cannot determine student's understanding level
- **confused**: Student appears fundamentally confused about the concept
- **partial_understanding**: Student grasps some parts but has gaps
- **mostly_understood**: Student has solid understanding with minor issues
- **mastered**: Student demonstrates complete understanding

### primary_error_type (TDG Section 11.4)
- **concept_error**: Fundamental concept misunderstanding (e.g., thinking multiplication distributes over addition incorrectly)
- **reading_error**: Misread the problem or conditions (e.g., used wrong value, ignored constraint)
- **formula_misuse**: Applied wrong formula or method (e.g., using addition instead of multiplication in formula)
- **step_skip**: Skipped necessary intermediate steps (e.g., jumping to final answer without showing work)
- **calculation_error**: Arithmetic or calculation mistake (e.g., 3+4=8, 2*6=10)
- **sign_error**: Sign mistakes - plus/minus confusion, dropping negative signs (e.g., -(x-2) = -x-2 instead of -x+2)
- **null**: No clear error, response is correct

### secondary_error_types
Array of additional error types present. Use empty array [] if no additional errors.
Examples: ["sign_error", "calculation_error"]

### feedback_summary (TDG Section 11.3)
- Must be 20 characters or less in Chinese
- Concise summary of the evaluation
- Should be actionable for the tutor
- Example: "斜率写对了" (slope written correctly)
- Example: "去括号有误" (bracket expansion error)
- Example: "思路正确" (approach correct)

### next_action
- **continue**: Student is on track, keep going with current approach
- **hint**: Student needs guidance to proceed
- **simplify**: Problem is too hard, break it down into smaller steps
- **explain**: Student needs explicit explanation

## FEEDBACK ASSEMBLY RULES (TDG Section 11.3)

Your feedback_summary must follow these patterns:

### Part 1: What's correct/incorrect about this step
Use affirming language for correct parts:
- "斜率写对了" (slope written correctly)
- "思路正确" (approach correct)
- "第一步没问题" (first step is fine)

Use corrective language for incorrect parts:
- "这里去括号有误" (bracket expansion error here)
- "符号处理出错" (sign handling error)
- "计算有误" (calculation error)

### Part 2: What to do next
Guide toward next action:
- "再想想常数项" (think about the constant term again)
- "重写一遍" (rewrite it)
- "先化简再计算" (simplify first, then calculate)

### Example Feedback (TDG Section 11.3)
Positive with correction:
"斜率写对了。你再想想常数项在图像里表示什么。"
(Positive: slope correct | Directive: think about what constant term represents in graph)

Error correction:
"这里去括号有误。先把2乘到括号里，再重写一遍。"
(Directive: multiply 2 into parentheses first, then rewrite)

## ERROR CLASSIFICATION STRATEGY (TDG Section 11.4)

When classifying errors, apply these rules in order:

### 1. Sign Errors (sign_error)
Indicators: Problems with positive/negative signs, dropping negative signs in parentheses
- Example: -(x-3) expanded incorrectly
- Example: -5 + 3 = -8 (should be -2)
- Example: x - (-3) = x - 3 (should be x + 3)

### 2. Step Skipping (step_skip)
Indicators: Missing intermediate steps, jumping to final answer
- Example: Going directly from equation to answer without showing work
- Example: Skipping the "combine like terms" step
- Example: Using result of one step as if it were obvious in next

### 3. Basic Arithmetic (calculation_error)
Indicators: Simple calculation mistakes in addition, multiplication, etc.
- Example: 8 + 5 = 12
- Example: 4 * 7 = 24 (should be 28)
- Example: 15 - 8 = 9 (should be 7)

### 4. Other Errors
If error doesn't match above, consider:
- concept_error: Fundamental misunderstanding of principle
- reading_error: Misread problem conditions
- formula_misuse: Applied wrong formula

### 5. Fallback Rule
If model doesn't return valid error cause, or classification is uncertain:
- Use concept_error as default for understanding gaps
- Use calculation_error for arithmetic mistakes under 20
- Use sign_error for parenthesis expansion errors
- Use step_skip for missing work between steps

## CRITICAL RULES

1. **Only output valid JSON** - No additional text, no markdown code blocks
2. **feedback_summary must be 20 characters or less** in Chinese
3. **Use exact enum values** as specified above
4. **primary_error_type can be null** if no clear error
5. **secondary_error_types should be an empty array []** if no additional errors
6. **Be consistent** - same error pattern should get same classification

## EXAMPLES

Input: "x = 3 + 6 = 9"
Output:
{
  "correctness": "correct",
  "understanding_level": "mostly_understood",
  "primary_error_type": null,
  "secondary_error_types": [],
  "feedback_summary": "计算正确",
  "next_action": "continue"
}

Input: "x = 3 + 6 = 8"
Output:
{
  "correctness": "incorrect",
  "understanding_level": "partial_understanding",
  "primary_error_type": "calculation_error",
  "secondary_error_types": [],
  "feedback_summary": "3加6不等于8",
  "next_action": "hint"
}

Input: "3(x-2) = 3x-2"
Output:
{
  "correctness": "incorrect",
  "understanding_level": "confused",
  "primary_error_type": "sign_error",
  "secondary_error_types": ["calculation_error"],
  "feedback_summary": "去括号有误",
  "next_action": "hint"
}`;

/**
 * Build evaluation prompt for AI API call
 * Combines system prompt with student input context
 */
export function buildEvaluationPrompt(context: {
  problemText: string;
  problemType: string | null;
  knowledgePoints: string[];
  studentInput: string;
  tutorState?: string;
  hintLevel?: number;
}): string {
  let prompt = `## Problem to Evaluate
${context.problemText}

**Problem Type:** ${context.problemType || 'unknown'}
**Knowledge Points:** ${context.knowledgePoints.join(', ') || 'not specified'}

**Hint Level:** ${context.hintLevel || 1}/5

## Student Response
"${context.studentInput}"

## Your Task
Evaluate the student's response and return ONLY a valid JSON object with the exact schema specified in the system prompt.
Be strict about character count for feedback_summary (max 20 characters in Chinese).
`;

  return prompt;
}

/**
 * Validate evaluation result structure
 * Ensures the model output matches expected schema
 */
export function validateEvaluationResult(result: unknown): {
  valid: boolean;
  errors: string[];
  parsed?: {
    correctness: Correctness;
    understandingLevel: UnderstandingLevel;
    primaryErrorType: ErrorType | null;
    secondaryErrorTypes: ErrorType[];
    feedbackSummary: string;
    nextAction: NextAction;
  };
} {
  const errors: string[] = [];

  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['Result is not an object'] };
  }

  const obj = result as Record<string, unknown>;

  // Check required string fields
  const stringFields = ['correctness', 'understanding_level', 'primary_error_type', 'feedback_summary', 'next_action'];
  for (const field of stringFields) {
    if (typeof obj[field] !== 'string') {
      errors.push(`Field '${field}' must be a string`);
    }
  }

  // Validate correctness enum
  const validCorrectness = ['correct', 'partial', 'incorrect'];
  if (!validCorrectness.includes(obj.correctness as string)) {
    errors.push(`correctness must be one of: ${validCorrectness.join(', ')}`);
  }

  // Validate understanding_level enum
  const validUnderstanding = ['unknown', 'confused', 'partial_understanding', 'mostly_understood', 'mastered'];
  if (!validUnderstanding.includes(obj.understanding_level as string)) {
    errors.push(`understanding_level must be one of: ${validUnderstanding.join(', ')}`);
  }

  // Validate primary_error_type
  const validErrorTypes = ['concept_error', 'reading_error', 'formula_misuse', 'step_skip', 'calculation_error', 'sign_error', null];
  if (!validErrorTypes.includes(obj.primary_error_type as string | null)) {
    errors.push(`primary_error_type must be one of: ${validErrorTypes.filter(v => v !== null).join(', ')} or null`);
  }

  // Validate secondary_error_types is array
  if (!Array.isArray(obj.secondary_error_types)) {
    errors.push('secondary_error_types must be an array');
  }

  // Validate next_action enum
  const validNextActions = ['continue', 'hint', 'simplify', 'explain'];
  if (!validNextActions.includes(obj.next_action as string)) {
    errors.push(`next_action must be one of: ${validNextActions.join(', ')}`);
  }

  // Check feedback_summary length (20 chars max)
  if (typeof obj.feedback_summary === 'string' && obj.feedback_summary.length > 20) {
    errors.push(`feedback_summary must be 20 characters or less (got ${obj.feedback_summary.length})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    parsed: {
      correctness: obj.correctness as Correctness,
      understandingLevel: obj.understanding_level as UnderstandingLevel,
      primaryErrorType: obj.primary_error_type as ErrorType | null,
      secondaryErrorTypes: (obj.secondary_error_types as ErrorType[]) || [],
      feedbackSummary: obj.feedback_summary as string,
      nextAction: obj.next_action as NextAction,
    },
  };
}

/**
 * Apply rule-based fallback when model fails to return valid result
 * Per TDG Section 11.4 - last resort classification strategy
 */
export function applyRuleBasedFallback(studentInput: string, problemText: string): {
  correctness: Correctness;
  understandingLevel: UnderstandingLevel;
  primaryErrorType: ErrorType | null;
  secondaryErrorTypes: ErrorType[];
  feedbackSummary: string;
  nextAction: NextAction;
} {
  // Default fallback
  const fallbackBase = {
    correctness: 'partial' as Correctness,
    understandingLevel: 'confused' as UnderstandingLevel,
    primaryErrorType: 'concept_error' as ErrorType,
    secondaryErrorTypes: [] as ErrorType[],
    feedbackSummary: '需要更多帮助' as string,
    nextAction: 'hint' as NextAction,
  };

  // Pattern-based error detection
  const input = studentInput.toLowerCase();

  // Check for sign errors (parentheses with negative signs)
  if (/-\s*[\(\[]/.test(input) || /\)\s*=\s*-\d/.test(input)) {
    fallbackBase.primaryErrorType = 'sign_error';
    fallbackBase.feedbackSummary = '符号处理需检查';
    return fallbackBase;
  }

  // Check for step skipping (missing intermediate notation)
  if (/=\s*\d+\s*$/.test(input) && !problemText.includes('=')) {
    fallbackBase.primaryErrorType = 'step_skip';
    fallbackBase.feedbackSummary = '缺少计算步骤';
    fallbackBase.nextAction = 'hint';
    return fallbackBase;
  }

  // Check for basic calculation patterns
  const calcPattern = /\d+\s*[+\-*÷^]\s*\d+\s*=\s*(\d+)/;
  const match = input.match(calcPattern);
  if (match) {
    // Simple arithmetic - could add calculation validation here
    fallbackBase.primaryErrorType = 'calculation_error';
    fallbackBase.feedbackSummary = '计算可能有误';
    return fallbackBase;
  }

  return fallbackBase;
}