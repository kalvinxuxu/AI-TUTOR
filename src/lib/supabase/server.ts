// Supabase Server
// TODO: Implement full Supabase server client

import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, supabaseServiceKey);
}