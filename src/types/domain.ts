/**
 * Domain Types
 * Core domain entities and interfaces for the AI Tutor MVP
 * Ref: TDG Section 8, 11.1
 */

// Problem entity
export interface Problem {
  id: string;
  userId: string;
  originalImageUrl: string;
  ocrText: string;
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  difficulty: number | null;
  confidence: number | null;
  source: string;
  createdAt: Date;
}

// Session entity
export interface Session {
  id: string;
  userId: string;
  problemId: string;
  status: 'active' | 'completed' | 'abandoned';
  currentTutorState: TutorState;
  hintLevel: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  solutionRevealed: boolean;
  startedAt: Date;
  endedAt: Date | null;
}

// Message entity
export interface Message {
  id: string;
  sessionId: string;
  role: 'student' | 'assistant' | 'system';
  content: string;
  tutorState: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// Step evaluation entity
export interface StepEvaluation {
  id: string;
  sessionId: string;
  messageId: string | null;
  studentInput: string;
  correctness: 'correct' | 'partial' | 'incorrect';
  understandingLevel: UnderstandingLevel;
  primaryErrorType: ErrorType | null;
  secondaryErrorTypes: ErrorType[];
  feedback: string;
  nextAction: NextAction;
  createdAt: Date;
}

// Review task entity
export interface ReviewTask {
  id: string;
  userId: string;
  sessionId: string | null;
  problemId: string | null;
  knowledgePoint: string;
  errorType: string | null;
  scheduledFor: Date;
  status: 'pending' | 'completed' | 'skipped';
  dedupeKey: string;
  createdAt: Date;
  completedAt: Date | null;
}

// Learner profile entity
export interface LearnerProfile {
  userId: string;
  weakKnowledgePoints: string[];
  frequentErrorTypes: string[];
  hintDependencyScore: number;
  recentAccuracy: number | null;
  profileVersion: number;
  updatedAt: Date;
}

// Enums for structured output (per TDG Section 11.1)
export type UnderstandingLevel =
  | 'unknown'
  | 'confused'
  | 'partial_understanding'
  | 'mostly_understood'
  | 'mastered';

export type ErrorType =
  | 'concept_error'
  | 'reading_error'
  | 'formula_misuse'
  | 'step_skip'
  | 'calculation_error'
  | 'sign_error';

export type NextAction = 'continue' | 'hint' | 'simplify' | 'explain';

export type TutorState =
  | 'observe'
  | 'hint'
  | 'encourage'
  | 'simplify'
  | 'challenge'
  | 'explain';

export type Correctness = 'correct' | 'partial' | 'incorrect';

// Evaluation result type (per TDG Section 11.1)
export interface EvaluationResult {
  correctness: Correctness;
  understandingLevel: UnderstandingLevel;
  primaryErrorType: ErrorType | null;
  secondaryErrorTypes: ErrorType[];
  feedbackSummary: string;
  nextAction: NextAction;
}

// Tutor context for AI orchestration
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
    correctness: Correctness;
    understandingLevel: UnderstandingLevel;
    feedback: string;
  };
  userId?: string;
  sessionId?: string;
}

// Tutor response from AI
export interface TutorResponse {
  message: string;
  tutorState: TutorState;
  hintLevel: number;
  isComplete: boolean;
}

// OCR result type
export interface OCRResult {
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  confidence: number;
  rawExtraction?: string;
}

// Model call log for instrumentation
export interface ModelCallLog {
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
  cost_usd?: number;
  timestamp?: string;
}