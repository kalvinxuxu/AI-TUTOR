/**
 * Supabase Client (Browser)
 * Client-side Supabase client with anon key for browser operations
 * Ref: TDG Section 16
 */

import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Environment variables must be set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create a browser client using the standard approach
 * This is used for client-side operations in the browser
 */
export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase browser client: Missing environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Create a Supabase client with SSR support for Next.js App Router
 * Use this in client components and API routes
 */
export function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Default export for convenience
export const supabase = createSupabaseClient();

/**
 * Get the current Supabase client
 * Alias for the default export
 */
export function getSupabaseClient() {
  return supabase;
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}