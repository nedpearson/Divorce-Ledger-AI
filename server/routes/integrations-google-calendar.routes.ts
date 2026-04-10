/**
 * Google Calendar Integration Routes
 * Mounts at: /api/integrations/google-calendar
 *
 * Endpoints:
 *   GET  /auth       — generate OAuth URL and redirect user to Google
 *   GET  /callback   — handle Google OAuth callback, store tokens
 *   GET  /status     — get connection status for the current user
 *   GET  /events     — proxy: fetch events from Google Calendar API
 *   POST /disconnect — revoke stored tokens and remove connection
 */
import { Router } from 'express';
import { db } from '../db';
import { integrationConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { getBaseUrl } from '../lib/baseUrl';

export const googleCalendarIntegrationRoutes = Router();

// ─── Config ──────────────────────────────────────────────────────────────────

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const appKey = () => process.env.SESSION_SECRET || 'divorce-ledger-calendar-encryption-key-32b';

function getClientId() { return process.env.GOOGLE_CLIENT_ID || ''; }
function getClientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ''; }
function getCallbackUrl() {
  return process.env.GOOGLE_CALENDAR_CALLBACK_URL ||
    `${getBaseUrl()}/api/integrations/google-calendar/callback`;
}

function isConfigured(): boolean {
  return !!(getClientId() && getClientSecret());
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(appKey(), 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(appKey(), 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Sign a state object into an HMAC-verified token.
 * Uses HMAC-SHA256 so we don't need req.session for CSRF protection —
 * safe under Railway's multi-replica/stateless-session environment.
 */
function signState(userId: string, nonce: string): string {
  const payload = `${userId}:${nonce}`;
  const sig = crypto.createHmac('sha256', appKey()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ userId, nonce, sig })).toString('base64url');
}

function verifyState(token: string): { userId: string } | null {
  try {
    const { userId, nonce, sig } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', appKey()).update(`${userId}:${nonce}`).digest('hex');
    if (sig !== expected) return null;
    return { userId };
  } catch {
    return null;
  }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

const requireAuth = (req: any, res: any, next: any) => {
  const userId =
    (req as any).session?.userId ||
    (req.user as any)?.id ||
    req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!req.user) req.user = { id: userId };
  next();
};

// ─── Token refresh ───────────────────────────────────────────────────────────

async function refreshAccessToken(connection: any): Promise<string | null> {
  if (!connection.refreshTokenEncrypted) return null;
  try {
    const refreshToken = decrypt(connection.refreshTokenEncrypted);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        client_secret: getClientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { access_token: string; expires_in: number };
    const newExpiry = new Date();
    newExpiry.setSeconds(newExpiry.getSeconds() + (data.expires_in || 3600));
    await db.update(integrationConnections).set({
      accessTokenEncrypted: encrypt(data.access_token),
      tokenExpiryAt: newExpiry,
      updatedAt: new Date(),
    }).where(eq(integrationConnections.id, connection.id));
    return data.access_token;
  } catch { return null; }
}

async function getValidToken(userId: string): Promise<{ token: string; connection: any } | null> {
  const connection = await db.query.integrationConnections.findFirst({
    where: and(
      eq(integrationConnections.userId, userId),
      eq(integrationConnections.integrationType, 'calendar'),
    ),
  });
  if (!connection?.accessTokenEncrypted) return null;
  const isExpired = connection.tokenExpiryAt && new Date(connection.tokenExpiryAt) < new Date();
  if (isExpired) {
    const refreshed = await refreshAccessToken(connection);
    if (!refreshed) return null;
    return { token: refreshed, connection };
  }
  return { token: decrypt(connection.accessTokenEncrypted), connection };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GET /auth  — Initiate OAuth flow
// Returns { url } for the frontend to redirect to, or redirects directly
// ═══════════════════════════════════════════════════════════════════════════════
googleCalendarIntegrationRoutes.get('/auth', requireAuth, (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'GOOGLE_CALENDAR_NOT_CONFIGURED',
      message: 'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not set in environment variables.',
    });
  }

  const userId = (req.user as any).id;
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = signState(userId, nonce);
  const callbackUrl = getCallbackUrl();

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent', // guarantees refresh_token on first grant
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // Return as JSON so the frontend can redirect (matches frontend connectCalendar pattern)
  res.json({ url: authUrl });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GET /callback — OAuth callback from Google
// ═══════════════════════════════════════════════════════════════════════════════
googleCalendarIntegrationRoutes.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Google Calendar] OAuth denied:', error);
    return res.redirect('/settings?error=calendar_denied');
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.redirect('/settings?error=invalid_request');
  }

  // Verify HMAC-signed state (stateless CSRF protection, no session needed)
  const verified = verifyState(state);
  if (!verified) {
    console.error('[Google Calendar] State verification failed');
    return res.redirect('/settings?error=invalid_state');
  }

  const { userId } = verified;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: getCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google Calendar] Token exchange failed:', errText);
      return res.redirect('/settings?error=token_exchange_failed');
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Get user email from Google
    let userEmail = userId;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userInfoRes.ok) {
        const info = await userInfoRes.json() as { email?: string; name?: string };
        userEmail = info.email || userId;
      }
    } catch { /* non-fatal */ }

    // Calculate expiry
    const expiry = new Date();
    expiry.setSeconds(expiry.getSeconds() + (tokens.expires_in || 3600));

    // Upsert integration connection
    const existing = await db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.userId, userId),
        eq(integrationConnections.integrationType, 'calendar'),
      ),
    });

    const payload = {
      userId,
      provider: 'google',
      integrationType: 'calendar' as const,
      externalAccountId: userEmail,
      displayName: userEmail,
      grantedScopes: ['calendar.readonly'],
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : existing?.refreshTokenEncrypted,
      tokenExpiryAt: expiry,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(integrationConnections).set(payload).where(eq(integrationConnections.id, existing.id));
    } else {
      await db.insert(integrationConnections).values(payload as any);
    }

    console.log(`[Google Calendar] ✓ Connected for user ${userId} (${userEmail})`);
    res.redirect('/settings?success=calendar_connected');
  } catch (err: any) {
    console.error('[Google Calendar] Callback error:', err.message);
    res.redirect('/settings?error=connection_failed');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GET /status
// ═══════════════════════════════════════════════════════════════════════════════
googleCalendarIntegrationRoutes.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const connection = await db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.userId, userId),
        eq(integrationConnections.integrationType, 'calendar'),
      ),
    });
    if (!connection) return res.json({ isConnected: false });
    res.json({
      isConnected: true,
      externalAccountId: connection.externalAccountId,
      displayName: connection.displayName,
      updatedAt: connection.updatedAt,
    });
  } catch {
    res.status(500).json({ error: 'Failed to check calendar status.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GET /events — Proxy Google Calendar events
// ═══════════════════════════════════════════════════════════════════════════════
googleCalendarIntegrationRoutes.get('/events', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const result = await getValidToken(userId);
    if (!result) {
      return res.json({ events: [], synced: false, message: 'Not connected to Google Calendar.' });
    }

    const now = new Date();
    const timeMin = (req.query.timeMin as string) || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = (req.query.timeMax as string) || new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    const params = new URLSearchParams({
      timeMin, timeMax,
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const gcalResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${result.token}` } }
    );

    if (!gcalResponse.ok) {
      if (gcalResponse.status === 401) {
        return res.json({ events: [], synced: false, message: 'Calendar access expired. Please reconnect.' });
      }
      return res.json({ events: [], synced: false, message: 'Failed to fetch calendar events.' });
    }

    const data = await gcalResponse.json() as { items?: any[] };
    const events = (data.items || []).map((item: any) => ({
      id: `gcal_${item.id}`,
      title: item.summary || '(No title)',
      description: item.description || '',
      startDate: item.start?.dateTime || item.start?.date || '',
      endDate: item.end?.dateTime || item.end?.date || '',
      allDay: !!item.start?.date,
      location: item.location || '',
      eventType: 'google_calendar',
      source: 'google',
      googleEventId: item.id,
      htmlLink: item.htmlLink,
    }));

    res.json({ events, synced: true, count: events.length });
  } catch (err: any) {
    console.error('[Google Calendar] Fetch error:', err);
    res.status(500).json({ events: [], synced: false, message: 'Internal error fetching calendar.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. POST /disconnect
// ═══════════════════════════════════════════════════════════════════════════════
googleCalendarIntegrationRoutes.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const connection = await db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.userId, userId),
        eq(integrationConnections.integrationType, 'calendar'),
      ),
    });
    if (connection) {
      // Attempt to revoke token at Google
      if (connection.accessTokenEncrypted) {
        try {
          const token = decrypt(connection.accessTokenEncrypted);
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          });
        } catch { /* non-fatal */ }
      }
      await db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id));
    }
    res.json({ success: true, message: 'Google Calendar disconnected.' });
  } catch {
    res.status(500).json({ error: 'Failed to disconnect.' });
  }
});
