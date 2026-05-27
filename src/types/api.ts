// API Types
// TODO: Implement full API request/response types

export interface CreateProblemRequest {
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CreateSessionRequest {
  problemId: string;
  userId: string;
}

export interface SendMessageRequest {
  content: string;
  role?: 'user' | 'assistant';
}

export interface EvaluationRequest {
  sessionId: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}