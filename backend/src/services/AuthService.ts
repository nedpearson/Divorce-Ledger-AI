import { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/clientAnon.js';
import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger } from '../logging/logger.js';
import { UnauthorizedError, ValidationError, ConflictError } from '../errors/AppError.js';
import { LoginInput, SignupInput } from '../validators/authValidators.js';

export class AuthService {
  /**
   * Sign up a new user
   */
  async signup(input: SignupInput): Promise<{ user: User; session: Session }> {
    const { email, password, fullName, subscription_tier } = input;

    // Check if user already exists
    const { data: existingUser } = await supabaseServiceRole
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          subscription_tier,
        },
      },
    });

    if (error) {
      logger.error({ error }, 'Signup failed');
      throw new ValidationError(error.message, { originalError: error });
    }

    if (!data.user || !data.session) {
      throw new ValidationError('Signup failed: no user or session returned');
    }

    logger.info({ userId: data.user.id, email }, 'User signed up successfully');

    return { user: data.user, session: data.session };
  }

  /**
   * Sign in a user
   */
  async login(input: LoginInput): Promise<{ user: User; session: Session }> {
    const { email, password } = input;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.warn({ email, error: error.message }, 'Login failed');
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!data.user || !data.session) {
      throw new UnauthorizedError('Login failed: no user or session returned');
    }

    logger.info({ userId: data.user.id, email }, 'User logged in successfully');

    return { user: data.user, session: data.session };
  }

  /**
   * Sign out a user
   */
  async logout(accessToken: string): Promise<void> {
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.error({ error }, 'Logout failed');
      throw new ValidationError(error.message, { originalError: error });
    }

    logger.info('User logged out successfully');
  }

  /**
   * Get user from access token
   */
  async getUserFromToken(accessToken: string): Promise<User> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      logger.warn({ error: error?.message }, 'Invalid token');
      throw new UnauthorizedError('Invalid or expired token');
    }

    return user;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ session: Session }> {
    const { data, error } = await supabase.auth.refreshSession({ refreshToken });

    if (error || !data.session) {
      logger.warn({ error: error?.message }, 'Token refresh failed');
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    logger.info({ userId: data.session.user.id }, 'Token refreshed successfully');

    return { session: data.session };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`,
    });

    if (error) {
      logger.error({ email, error }, 'Password reset request failed');
      throw new ValidationError(error.message, { originalError: error });
    }

    logger.info({ email }, 'Password reset email sent');
  }

  /**
   * Update password
   */
  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    // First verify the token is valid
    await this.getUserFromToken(accessToken);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      logger.error({ error }, 'Password update failed');
      throw new ValidationError(error.message, { originalError: error });
    }

    logger.info('Password updated successfully');
  }

  /**
   * Initiate OAuth sign-in
   */
  async initiateOAuthSignIn(provider: 'google' | 'github'): Promise<{ url: string }> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`,
      },
    });

    if (error || !data.url) {
      logger.error({ provider, error }, 'OAuth initiation failed');
      throw new ValidationError(error?.message || 'Failed to initiate OAuth', {
        originalError: error,
      });
    }

    logger.info({ provider }, 'OAuth sign-in initiated');

    return { url: data.url };
  }

  /**
   * Exchange OAuth code for session
   */
  async exchangeOAuthCode(code: string): Promise<{ user: User; session: Session }> {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user || !data.session) {
      logger.error({ error }, 'OAuth code exchange failed');
      throw new UnauthorizedError('Failed to exchange OAuth code');
    }

    logger.info({ userId: data.user.id }, 'OAuth code exchanged successfully');

    return { user: data.user, session: data.session };
  }

  /**
   * Get user profile by ID (admin only)
   */
  async getUserProfile(userId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      logger.error({ userId, error }, 'Failed to fetch user profile');
      throw new ValidationError('User not found', { originalError: error });
    }

    return data;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Record<string, any>): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, updates, error }, 'Failed to update user profile');
      throw new ValidationError('Failed to update user profile', { originalError: error });
    }

    logger.info({ userId }, 'User profile updated');

    return data;
  }
}

export const authService = new AuthService();
