/**
 * Supabase Server Client
 * Server-side Supabase client with service role for backend operations
 * Ref: TDG Section 16
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables should be set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Create and return a Supabase client with service role key
 * Use this for server-side operations that need elevated privileges
 */
export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase server client: Missing environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get a Supabase client for admin operations (bypasses RLS)
 * Lazy initialization to prevent build failures when env vars are missing
 */
export function getSupabaseAdmin() {
  return getSupabaseServerClient();
}

/**
 * @deprecated Use getSupabaseAdmin() instead - direct export throws if env vars missing at build time
 */
Object.defineProperty(module, 'supabaseAdmin', {
  get: () => {
    console.warn('supabaseAdmin direct export is deprecated, use getSupabaseAdmin() instead');
    return getSupabaseServerClient();
  },
  configurable: true,
});

/**
 * Database table types for type safety
 */
export type Database = {
  public: {
    Tables: {
      problems: {
        Row: {
          id: string;
          user_id: string;
          original_image_url: string;
          ocr_text: string;
          normalized_text: string;
          problem_type: string | null;
          knowledge_points: string[];
          difficulty: number | null;
          confidence: number | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          original_image_url: string;
          ocr_text: string;
          normalized_text: string;
          problem_type?: string | null;
          knowledge_points?: string[];
          difficulty?: number | null;
          confidence?: number | null;
          source?: string;
          created_at?: string;
        };
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          problem_id: string;
          status: 'active' | 'completed' | 'abandoned';
          current_tutor_state: string;
          hint_level: number;
          consecutive_failures: number;
          consecutive_successes: number;
          solution_revealed: boolean;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          problem_id: string;
          status?: 'active' | 'completed' | 'abandoned';
          current_tutor_state?: string;
          hint_level?: number;
          consecutive_failures?: number;
          consecutive_successes?: number;
          solution_revealed?: boolean;
          started_at?: string;
          ended_at?: string | null;
        };
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          role: 'student' | 'assistant' | 'system';
          content: string;
          tutor_state: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: 'student' | 'assistant' | 'system';
          content: string;
          tutor_state?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
      };
      step_evaluations: {
        Row: {
          id: string;
          session_id: string;
          message_id: string | null;
          student_input: string;
          correctness: 'correct' | 'partial' | 'incorrect';
          understanding_level: 'unknown' | 'confused' | 'partial_understanding' | 'mostly_understood' | 'mastered';
          primary_error_type: string | null;
          secondary_error_types: string[];
          feedback: string;
          next_action: 'continue' | 'hint' | 'simplify' | 'explain';
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          message_id?: string | null;
          student_input: string;
          correctness: 'correct' | 'partial' | 'incorrect';
          understanding_level: 'unknown' | 'confused' | 'partial_understanding' | 'mostly_understood' | 'mastered';
          primary_error_type?: string | null;
          secondary_error_types?: string[];
          feedback: string;
          next_action: 'continue' | 'hint' | 'simplify' | 'explain';
          created_at?: string;
        };
      };
      review_tasks: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          problem_id: string | null;
          knowledge_point: string;
          error_type: string | null;
          scheduled_for: string;
          status: 'pending' | 'completed' | 'skipped';
          dedupe_key: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          problem_id?: string | null;
          knowledge_point: string;
          error_type?: string | null;
          scheduled_for: string;
          status?: 'pending' | 'completed' | 'skipped';
          dedupe_key: string;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      learner_profiles: {
        Row: {
          user_id: string;
          weak_knowledge_points: string[];
          frequent_error_types: string[];
          hint_dependency_score: number;
          recent_accuracy: number | null;
          profile_version: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          weak_knowledge_points?: string[];
          frequent_error_types?: string[];
          hint_dependency_score?: number;
          recent_accuracy?: number | null;
          profile_version?: number;
          updated_at?: string;
        };
      };
    };
  };
};