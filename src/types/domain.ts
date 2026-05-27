// Domain Types
// TODO: Implement full domain types as per TDG

export interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: Date;
}

export interface Session {
  id: string;
  problemId: string;
  userId: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: Date;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface Evaluation {
  id: string;
  sessionId: string;
  score: number;
  feedback: string;
  createdAt: Date;
}

export interface ReviewTask {
  id: string;
  problemId: string;
  status: 'pending' | 'in_review' | 'completed';
  createdAt: Date;
}