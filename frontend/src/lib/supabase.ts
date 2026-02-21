import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Auth helpers
export const auth = {
  /**
   * Sign up a new user
   */
  signUp: async (email: string, password: string, metadata?: { full_name?: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) throw error;
    return data;
  },

  /**
   * Sign in with email and password
   */
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Sign in with OAuth provider
   */
  signInWithOAuth: async (provider: 'google' | 'github') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
    return data;
  },

  /**
   * Sign out
   */
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Get current user
   */
  getUser: async (): Promise<User | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Get current session
   */
  getSession: async (): Promise<Session | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  },

  /**
   * Reset password
   */
  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) throw error;
  },

  /**
   * Update password
   */
  updatePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (callback: (user: User | null) => void) => {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user ?? null);
    });
  },
};

// Storage helpers
export const storage = {
  /**
   * Generate signed URL for file
   */
  getSignedUrl: async (bucket: string, path: string, expiresIn: number = 3600) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  },

  /**
   * Upload file
   */
  upload: async (bucket: string, path: string, file: File) => {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file);

    if (error) throw error;
    return data;
  },

  /**
   * Download file
   */
  download: async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) throw error;
    return data;
  },

  /**
   * Delete file
   */
  remove: async (bucket: string, paths: string[]) => {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) throw error;
  },
};

export default supabase;
