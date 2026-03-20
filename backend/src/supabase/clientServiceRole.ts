import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

// Supabase client with service role key (bypasses RLS, use with caution)
let _supabaseServiceRole: SupabaseClient | null = null;

export function getSupabaseServiceRole(): SupabaseClient {
  if (!_supabaseServiceRole) {
    _supabaseServiceRole = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info('Supabase client (service role) initialized');
  }

  return _supabaseServiceRole;
}

// IMPORTANT: Service role client bypasses Row Level Security (RLS)
// Only use for:
// - Server-to-server operations
// - Admin operations
// - Bulk operations
// - Operations that need to access any user's data

// NEVER expose service role key to frontend or client code!

// Export singleton
export const supabaseServiceRole = getSupabaseServiceRole();
