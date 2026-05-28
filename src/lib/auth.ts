/**
 * Authentication Helper for Supabase SSR
 * Ref: TDG Section 16 - Real Supabase Auth chain
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Development bypass user ID - a valid UUID for local testing
const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Get user ID from Supabase Auth via SSR cookie handling
 * Replaces the pseudo x-user-id authentication
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  // Check for x-user-id header first (development bypass and MVP mode)
  const devUserId = request.headers.get('x-user-id');

  // If Supabase is not configured, fall back to x-user-id header
  if (!supabaseUrl || !supabaseAnonKey) {
    if (devUserId) {
      return devUserId;
    }
    console.warn('Supabase not configured, cannot authenticate user');
    return null;
  }

  // Create a cookie adapter from request cookies
  const cookieAdapter = {
    getAll() {
      return request.cookies.getAll();
    },
  };

  // Create Supabase SSR client
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: cookieAdapter,
    }
  );

  // Get authenticated user from Supabase
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Fall back to x-user-id header if Supabase auth fails
    if (devUserId) {
      return devUserId;
    }
    return null;
  }

  return user.id;
}