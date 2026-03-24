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
    
    // Authenticate the native Express session defensively
    if (typeof (req as any).login === 'function') {
      (req as any).login(user, (err: any) => {
        if (err) {
          console.error('Passport login error during Google OAuth:', err);
          return res.status(500).send('Internal server error during session instantiation.');
        }
        res.redirect('/');
      });
    } else if ((req as any).session) {
      (req as any).session.userId = user.id;
      if (typeof (req as any).session.save === 'function') {
        (req as any).session.save(() => res.redirect('/'));
      } else {
        res.redirect('/');
      }
    } else {
      res.redirect('/');
    }
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
