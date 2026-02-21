import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

// Supabase client with anon key (for user-context operations)
let supabaseAnon: SupabaseClient | null = null;

export function getSupabaseAnon(): SupabaseClient {
  if (!supabaseAnon) {
    supabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    logger.info('Supabase client (anon) initialized');
  }

  return supabaseAnon;
}

// Create user-specific client from JWT token
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

// Verify JWT token and get user
export async function verifyToken(token: string) {
  const supabase = getSupabaseAnon();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return user;
}

// Export singleton
export const supabase = getSupabaseAnon();
