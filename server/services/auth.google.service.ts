import { db } from '../db';
import { users, userOauthConnections, authAuditLogs, type User } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { getBaseUrl } from '../lib/baseUrl';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

export class GoogleAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  }

  /** Dynamically resolve the redirect URI from the runtime environment */
  private get redirectUri(): string {
    const uri = process.env.GOOGLE_CALLBACK_URL || `${getBaseUrl()}/api/auth/google/callback`;
    console.log(`[Google OAuth] redirect_uri resolved to: ${uri}`);
    return uri;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  generateAuthUrl(state: string): string {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials missing.');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      state: state,
      access_type: 'offline', // Request refresh token for calendar sync
      prompt: 'consent'  // Force consent screen to get refresh_token
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange token.`); // Intentionally redacting exact error body to prevent leaking secrets to UI
    }

    return response.json();
  }

  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info from Google');
    }

    return response.json();
  }

  async linkOrAuthenticateUser(googleUser: GoogleUserInfo): Promise<User> {
    if (!googleUser.email_verified) {
      throw new Error('Google email is not verified.');
    }

    const { sub, email, name, picture } = googleUser;

    // 1. Check if an OAuth connection already exists bridging this identity
    const existingConnection = await db.query.userOauthConnections.findFirst({
      where: and(
        eq(userOauthConnections.provider, 'google'),
        eq(userOauthConnections.providerAccountId, sub)
      ),
    });

    if (existingConnection) {
      // 2. Return the associated underlying user account
      const user = await db.query.users.findFirst({
        where: eq(users.id, existingConnection.userId),
      });
      if (!user) throw new Error('Orphaned OAuth connection found.');
      
      this.logAudit(user.id, 'login', 'success');
      return user as User;
    }

    // 3. Fallback: Check if the email exists in our system to transparently link
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    let action = 'link';

    if (!user) {
      // 4. Create a new user if completely absent
      action = 'create_and_link';
      // Generate a highly secure random hex for the internal password so they can only log in via Google
      const secureRandomPassword = crypto.randomBytes(32).toString('hex');
      const [newUser] = await db.insert(users).values({
        email,
        password: secureRandomPassword,
        fullName: name,
        profilePhoto: picture,
        role: 'client',
        status: 'active',
        subscriptionTier: 'free'
      }).returning();
      user = newUser;
    }

    // 5. Establish the OAuth connection mapping identity structurally
    await db.insert(userOauthConnections).values({
      userId: user.id,
      provider: 'google',
      providerAccountId: sub,
      providerEmail: email,
      grantedScopes: ['openid', 'email', 'profile'],
    });

    this.logAudit(user.id, action, 'success');
    return user as User;
  }

  async logAudit(userId: string | null, action: string, status: string, errorMessage?: string) {
    try {
        await db.insert(authAuditLogs).values({
          userId: userId || undefined,
          provider: 'google',
          action,
          status,
          redactedErrorMessage: errorMessage ? errorMessage.substring(0, 255) : null,
        });
    } catch (e) {
        console.error("Failed to log audit event:", e);
    }
  }
}

export const googleAuthService = new GoogleAuthService();
