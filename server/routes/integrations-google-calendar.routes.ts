import { Router } from 'express';
import { db } from '../db';
import { integrationConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export const googleCalendarIntegrationRoutes = Router();

const appKey = () => process.env.SESSION_SECRET || 'divorce-ledger-calendar-encryption-key-32b';

function decrypt(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(appKey(), 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(appKey(), 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Middleware to ensure authentication
const requireAuth = (req: any, res: any, next: any) => {
  const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  if (!req.user) {
    req.user = { id: userId };
  }
  next();
};

/** Refresh an expired access token using the stored refresh token */
async function refreshAccessToken(connection: any): Promise<string | null> {
  if (!connection.refreshTokenEncrypted) return null;

  try {
    const refreshToken = decrypt(connection.refreshTokenEncrypted);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('[Google Calendar] Token refresh failed:', await response.text());
      return null;
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const newExpiry = new Date();
    newExpiry.setSeconds(newExpiry.getSeconds() + (data.expires_in || 3600));

    // Update stored token
    await db.update(integrationConnections).set({
      accessTokenEncrypted: encrypt(data.access_token),
      tokenExpiryAt: newExpiry,
      updatedAt: new Date(),
    }).where(eq(integrationConnections.id, connection.id));

    return data.access_token;
  } catch (err) {
    console.error('[Google Calendar] Token refresh error:', err);
    return null;
  }
}

/** Get a valid access token, refreshing if expired */
async function getValidToken(userId: string): Promise<{ token: string; connection: any } | null> {
  const connection = await db.query.integrationConnections.findFirst({
    where: and(
      eq(integrationConnections.userId, userId),
      eq(integrationConnections.integrationType, 'calendar'),
    ),
  });

  if (!connection || !connection.accessTokenEncrypted) return null;

  // Check if token is expired
  const isExpired = connection.tokenExpiryAt && new Date(connection.tokenExpiryAt) < new Date();
  
  if (isExpired) {
    const refreshed = await refreshAccessToken(connection);
    if (!refreshed) return null;
    return { token: refreshed, connection };
  }

  return { token: decrypt(connection.accessTokenEncrypted), connection };
}

// ─── STATUS ─────────────────────────────────────────────────────────
googleCalendarIntegrationRoutes.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const connection = await db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.userId, userId),
        eq(integrationConnections.integrationType, 'calendar'),
      ),
    });

    if (!connection) {
      return res.json({ isConnected: false });
    }

    res.json({
      isConnected: true,
      externalAccountId: connection.externalAccountId,
      displayName: connection.displayName,
      updatedAt: connection.updatedAt,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to check calendar status.' });
  }
});

// ─── FETCH EVENTS FROM GOOGLE CALENDAR API ──────────────────────────
googleCalendarIntegrationRoutes.get('/events', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const result = await getValidToken(userId);

    if (!result) {
      return res.json({ events: [], synced: false, message: 'Not connected to Google Calendar.' });
    }

    // Default: current month ± 30 days
    const now = new Date();
    const timeMin = req.query.timeMin as string || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = req.query.timeMax as string || new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const gcalResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${result.token}` } }
    );

    if (!gcalResponse.ok) {
      const errText = await gcalResponse.text();
      console.error('[Google Calendar] API error:', gcalResponse.status, errText);

      // If 401, token might be revoked
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

// ─── DISCONNECT ─────────────────────────────────────────────────────
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
      await db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id));
    }
    res.json({ success: true, message: 'Google Calendar disconnected.' });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to disconnect.' });
  }
});
