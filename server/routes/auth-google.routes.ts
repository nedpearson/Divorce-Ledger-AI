import { Router } from 'express';
import { googleAuthService } from '../services/auth.google.service';
import crypto from 'crypto';

export const authGoogleRouter = Router();

authGoogleRouter.get('/api/auth/google', (req, res) => {
  if (!googleAuthService.isConfigured()) {
    return res.status(503).json({ error: 'GOOGLE_AUTH_NOT_CONFIGURED' });
  }

  // Generate a random anti-CSRF state token and store it in the session
  const state = crypto.randomBytes(32).toString('hex');
  if (!(req as any).session) {
    return res.status(500).json({ error: 'Session middleware is missing or disabled.' });
  }
  
  (req as any).session.oauthState = state;
  const url = googleAuthService.generateAuthUrl(state);
  res.redirect(url);
});

authGoogleRouter.get('/api/auth/google/callback', async (req, res) => {
  if (!googleAuthService.isConfigured()) {
    return res.redirect('/login?error=GOOGLE_AUTH_NOT_CONFIGURED');
  }

  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state) {
    return res.status(400).send('Invalid auth redirect payload from Identity Provider.');
  }

  // Verify anti-CSRF state
  const sessionState = (req as any).session?.oauthState;
  if (!sessionState || state !== sessionState) {
    return res.status(403).send('Invalid state token (possible CSRF attack). Please try logging in again.');
  }

  // Clear state so it can't be reused
  delete (req as any).session.oauthState;

  try {
    const tokens = await googleAuthService.exchangeCodeForToken(code);
    const userInfo = await googleAuthService.getUserInfo(tokens.access_token);
    const user = await googleAuthService.linkOrAuthenticateUser(userInfo);
    
    // Persist Google Calendar tokens for calendar sync
    if (tokens.access_token) {
      try {
        const { db } = await import('../db');
        const { integrationConnections } = await import('@shared/schema');
        const { eq, and } = await import('drizzle-orm');
        const crypto = await import('crypto');

        const appKey = process.env.SESSION_SECRET || 'divorce-ledger-calendar-encryption-key-32b';
        const encrypt = (text: string) => {
          const iv = crypto.randomBytes(16);
          const key = crypto.scryptSync(appKey, 'salt', 32);
          const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
          let encrypted = cipher.update(text, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          return iv.toString('hex') + ':' + encrypted;
        };

        const expiry = new Date();
        expiry.setSeconds(expiry.getSeconds() + (tokens.expires_in || 3600));

        const existing = await db.query.integrationConnections.findFirst({
          where: and(
            eq(integrationConnections.userId, user.id),
            eq(integrationConnections.integrationType, 'calendar')
          )
        });

        const payload = {
          userId: user.id,
          provider: 'google',
          integrationType: 'calendar' as const,
          externalAccountId: userInfo.email,
          displayName: userInfo.name || userInfo.email,
          grantedScopes: ['calendar.readonly'],
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          tokenExpiryAt: expiry,
          updatedAt: new Date(),
        };

        if (existing) {
          await db.update(integrationConnections).set(payload).where(eq(integrationConnections.id, existing.id));
        } else {
          await db.insert(integrationConnections).values(payload as any);
        }
        console.log(`[Google Calendar] Token stored for ${user.id} — calendar sync enabled`);
      } catch (calErr) {
        console.error('[Google Calendar] Failed to store token (non-fatal):', calErr);
      }
    }
    
    // Create a proper session cookie for the app
    const { storage } = await import('../storage');
    const crypt = await import('crypto');
    const refreshTokenHash = crypt.randomBytes(32).toString('hex');
    const session = await storage.createSession({
      userId: user.id,
      deviceId: null,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      mfaVerified: false,
    });
    res.clearCookie('session_id', { path: '/' });
    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.cookie('environment', 'live', { path: '/' });

    // Also set session for express-session
    if ((req as any).session) {
      (req as any).session.userId = user.id;
    }

    res.redirect('/home');
  } catch (error: any) {
    console.error('Google OAuth Exchange Error:', error);
    await googleAuthService.logAudit(null, 'login', 'failure', error.message);
    res.redirect('/login?error=GoogleAuthFailed');
  }
});

authGoogleRouter.post('/api/auth/google/disconnect', async (req, res) => {
  const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { eq, and, isNull } = await import('drizzle-orm');
    const { db } = await import('../db');
    const { userOauthConnections } = await import('@shared/schema');

    // Soft delete / unlink active connections
    await db.update(userOauthConnections)
      .set({ disconnectedAt: new Date() })
      .where(and(
        eq(userOauthConnections.userId, userId),
        eq(userOauthConnections.provider, 'google'),
        isNull(userOauthConnections.disconnectedAt)
      ));

    await googleAuthService.logAudit(userId, 'disconnect', 'success', 'Google account disconnected.');
    res.json({ success: true, message: 'Google account disconnected successfully.' });
  } catch (error: any) {
    console.error('Disconnect error:', error);
    await googleAuthService.logAudit(userId, 'disconnect', 'failure', error.message);
    res.status(500).json({ error: 'Failed to disconnect Google account.' });
  }
});

authGoogleRouter.get('/api/auth/google/connections', async (req, res) => {
  const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { eq, isNull, and } = await import('drizzle-orm');
    const { db } = await import('../db');
    const { userOauthConnections } = await import('@shared/schema');
    
    const connections = await db.query.userOauthConnections.findMany({
      where: and(
        eq(userOauthConnections.userId, userId),
        isNull(userOauthConnections.disconnectedAt)
      )
    });
    
    res.json(connections);
  } catch (error) {
    console.error('Failed to fetch connections:', error);
    res.status(500).json({ error: 'Internal server error while retrieving identity links.' });
  }
});
