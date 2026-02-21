import { z } from 'zod';

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Signup schema
export const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
  fullName: z.string().min(1, 'Full name is required').max(100),
  subscription_tier: z.enum(['free', 'professional', 'lawyer']).default('free'),
});

export type SignupInput = z.infer<typeof signupSchema>;

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

// Password reset schema
export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// OAuth callback schema
export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;

// Token refresh schema
export const tokenRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type TokenRefreshInput = z.infer<typeof tokenRefreshSchema>;
