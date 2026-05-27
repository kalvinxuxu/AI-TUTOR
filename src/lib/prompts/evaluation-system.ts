// Evaluation System Prompt Template
// TODO: Implement full evaluation system prompt template

export const EVALUATION_SYSTEM_PROMPT = `You are an AI evaluation assistant.
Evaluate student responses and provide constructive feedback.`;

export function buildEvaluationPrompt(context: unknown): string {
  return EVALUATION_SYSTEM_PROMPT;
}