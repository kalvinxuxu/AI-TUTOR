/**
 * Session Service
 * Handles session lifecycle, message persistence, and tutor state management
 * Ref: TDG Section 6 (Session Service)
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, Message, TutorState } from '@/types/domain';
import { supabase } from '@/lib/supabase/client';
import { sessionStore, messageStore } from './session-store';

/**
 * Create a new tutoring session
 * @param userId - User ID
 * @param problemId - Problem ID
 * @returns Created Session
 */
export async function createSession(userId: string, problemId: string): Promise<Session> {
  const sessionId = uuidv4();
  const now = new Date();

  const session: Session = {
    id: sessionId,
    userId,
    problemId,
    status: 'active',
    currentTutorState: 'observe' as TutorState,
    hintLevel: 1,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    solutionRevealed: false,
    startedAt: now,
    endedAt: null,
  };

  if (supabase) {
    const { error } = await supabase.from('sessions').insert({
      id: session.id,
      user_id: session.userId,
      problem_id: session.problemId,
      status: session.status,
      current_tutor_state: session.currentTutorState,
      hint_level: session.hintLevel,
      consecutive_failures: session.consecutiveFailures,
      consecutive_successes: session.consecutiveSuccesses,
      solution_revealed: session.solutionRevealed,
      started_at: session.startedAt.toISOString(),
      ended_at: null,
    });

    if (error) {
      console.error('Failed to persist session to Supabase:', error);
      throw new Error('Failed to persist session: ' + error.message);
    }
  }

  // Always write to in-memory store (MVP fallback)
  sessionStore.set(session.id, session);

  return session;
}

/**
 * Get session by ID
 * @param id - Session ID
 * @returns Session or null
 */
export async function getSession(id: string): Promise<Session | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        userId: data.user_id,
        problemId: data.problem_id,
        status: data.status,
        currentTutorState: data.current_tutor_state as TutorState,
        hintLevel: data.hint_level,
        consecutiveFailures: data.consecutive_failures,
        consecutiveSuccesses: data.consecutive_successes,
        solutionRevealed: data.solution_revealed,
        startedAt: new Date(data.started_at),
        endedAt: data.ended_at ? new Date(data.ended_at) : null,
      };
    }
  }

  // Fallback to in-memory store
  const cached = sessionStore.get(id);
  if (cached) {
    return cached;
  }

  return null;
}

/**
 * Add a message to a session
 * @param sessionId - Session ID
 * @param role - Message role (student, assistant, system)
 * @param content - Message content
 * @param tutorState - Optional tutor state at time of message
 * @param metadata - Optional metadata
 * @returns Created Message
 */
export async function addMessage(
  sessionId: string,
  role: 'student' | 'assistant' | 'system',
  content: string,
  tutorState?: TutorState,
  metadata: Record<string, unknown> = {}
): Promise<Message> {
  const messageId = uuidv4();
  const now = new Date();

  const message: Message = {
    id: messageId,
    sessionId,
    role,
    content,
    tutorState: tutorState || null,
    metadata,
    createdAt: now,
  };

  if (supabase) {
    const { error } = await supabase.from('messages').insert({
      id: message.id,
      session_id: message.sessionId,
      role: message.role,
      content: message.content,
      tutor_state: message.tutorState,
      metadata: message.metadata,
      created_at: message.createdAt.toISOString(),
    });

    if (error) {
      console.error('Failed to persist message to Supabase:', error);
      throw new Error('Failed to persist message: ' + error.message);
    }
  }

  // Always write to in-memory store (MVP fallback)
  const existing = messageStore.get(sessionId) ?? [];
  existing.push(message);
  messageStore.set(sessionId, existing);

  return message;
}

/**
 * Get all messages for a session
 * @param sessionId - Session ID
 * @param limit - Maximum number of messages
 * @returns Array of Messages
 */
export async function getMessages(
  sessionId: string,
  limit: number = 100
): Promise<Message[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!error && data) {
      return data.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role as 'student' | 'assistant' | 'system',
        content: row.content,
        tutorState: row.tutor_state as TutorState | null,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at),
      }));
    }
  }

  // Fallback to in-memory store
  return messageStore.get(sessionId) ?? [];
}

/**
 * Update session tutor state and counters
 * @param sessionId - Session ID
 * @param updates - State updates
 */
export async function updateSessionState(
  sessionId: string,
  updates: {
    tutorState?: TutorState;
    hintLevel?: number;
    consecutiveFailures?: number;
    consecutiveSuccesses?: number;
    solutionRevealed?: boolean;
  }
): Promise<void> {
  if (supabase) {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.tutorState !== undefined) dbUpdates.current_tutor_state = updates.tutorState;
    if (updates.hintLevel !== undefined) dbUpdates.hint_level = updates.hintLevel;
    if (updates.consecutiveFailures !== undefined) dbUpdates.consecutive_failures = updates.consecutiveFailures;
    if (updates.consecutiveSuccesses !== undefined) dbUpdates.consecutive_successes = updates.consecutiveSuccesses;
    if (updates.solutionRevealed !== undefined) dbUpdates.solution_revealed = updates.solutionRevealed;

    await supabase.from('sessions').update(dbUpdates).eq('id', sessionId);
  }
}

/**
 * Mark session as complete
 * @param sessionId - Session ID
 */
export async function completeSession(sessionId: string): Promise<void> {
  if (supabase) {
    await supabase.from('sessions').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', sessionId);
  }
}

/**
 * Mark session as abandoned
 * @param sessionId - Session ID
 */
export async function abandonSession(sessionId: string): Promise<void> {
  if (supabase) {
    await supabase.from('sessions').update({
      status: 'abandoned',
      ended_at: new Date().toISOString(),
    }).eq('id', sessionId);
  }
}

/**
 * Record evaluation result and update session counters
 * @param sessionId - Session ID
 * @param correctness - Evaluation correctness
 * @param understandingLevel - Student understanding level
 */
export async function recordEvaluationResult(
  sessionId: string,
  correctness: 'correct' | 'partial' | 'incorrect',
  understandingLevel: string
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  let consecutiveFailures = session.consecutiveFailures;
  let consecutiveSuccesses = session.consecutiveSuccesses;

  if (correctness === 'incorrect') {
    consecutiveFailures += 1;
    consecutiveSuccesses = 0;
  } else if (correctness === 'correct') {
    consecutiveSuccesses += 1;
    consecutiveFailures = 0;
  } else {
    // partial - reset both
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
  }

  await updateSessionState(sessionId, {
    consecutiveFailures,
    consecutiveSuccesses,
  });
}

/**
 * Get recent messages for context (last N messages)
 * @param sessionId - Session ID
 * @param count - Number of recent messages
 */
export async function getRecentMessages(
  sessionId: string,
  count: number = 10
): Promise<Array<{ role: 'student' | 'assistant'; content: string }>> {
  const messages = await getMessages(sessionId, count);
  return messages
    .filter(m => m.role === 'student' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'student' | 'assistant',
      content: m.content,
    }));
}

// Session Service class
export class SessionService {
  async createSession(userId: string, problemId: string): Promise<Session> {
    return createSession(userId, problemId);
  }

  async getSession(id: string): Promise<Session | null> {
    return getSession(id);
  }

  async addMessage(
    sessionId: string,
    role: 'student' | 'assistant' | 'system',
    content: string,
    tutorState?: TutorState,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return addMessage(sessionId, role, content, tutorState, metadata);
  }

  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    return getMessages(sessionId, limit);
  }

  async updateSessionState(
    sessionId: string,
    updates: {
      tutorState?: TutorState;
      hintLevel?: number;
      consecutiveFailures?: number;
      consecutiveSuccesses?: number;
      solutionRevealed?: boolean;
    }
  ): Promise<void> {
    return updateSessionState(sessionId, updates);
  }

  async completeSession(sessionId: string): Promise<void> {
    return completeSession(sessionId);
  }

  async abandonSession(sessionId: string): Promise<void> {
    return abandonSession(sessionId);
  }

  async recordEvaluationResult(
    sessionId: string,
    correctness: 'correct' | 'partial' | 'incorrect',
    understandingLevel: string
  ): Promise<void> {
    return recordEvaluationResult(sessionId, correctness, understandingLevel);
  }

  async getRecentMessages(sessionId: string, count?: number): Promise<Array<{ role: 'student' | 'assistant'; content: string }>> {
    return getRecentMessages(sessionId, count);
  }
}

export const sessionService = new SessionService();