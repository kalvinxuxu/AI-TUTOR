/**
 * Session Store - In-memory fallback for local development
 * WARNING: Data is lost on dev server restart / serverless cold starts
 * Only for MVP development without Supabase
 */

import type { Session, Message } from '@/types/domain';

// Re-export types for convenience
export type { Session, Message };

const globalForSessions = globalThis as unknown as {
  __sessionStore?: Map<string, Session>;
  __messageStore?: Map<string, Message[]>;
};

export const sessionStore =
  globalForSessions.__sessionStore ?? new Map<string, Session>();

export const messageStore =
  globalForSessions.__messageStore ?? new Map<string, Message[]>();

globalForSessions.__sessionStore = sessionStore;
globalForSessions.__messageStore = messageStore;