import { Router } from 'express';
import { db } from '../db';
import { integrationConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export const googleCalendarIntegrationRoutes = Router();

// Middleware to ensure authentication
const requireAuth = (req: any, res: any, next: any) => {
    const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'You must be logged in to manage Google Calendar integration.' });
    }
    if (!req.user) {
        req.user = { id: userId };
    }
    next();
};

googleCalendarIntegrationRoutes.get('/auth', requireAuth, (req, res) => {
    // Generate an anti-CSRF state token securely
    const customState = crypto.randomBytes(16).toString('hex');
    (req as any).session.calendarAuthState = customState;
    
    // MOCK MODE: Bypass Google and return local callback immediately
    const authUrl = `/api/integrations/google-calendar/callback?code=mock_oauth_code_calendar&state=${customState}`;
    res.json({ url: authUrl });
});

googleCalendarIntegrationRoutes.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.redirect('/settings?error=calendar_denied');
    }

    if (!code || typeof code !== 'string') {
        return res.redirect('/settings?error=invalid_request');
    }

    if (state !== (req as any).session.calendarAuthState) {
        return res.redirect('/settings?error=invalid_state_csrf');
    }

    if (!req.user || !(req.user as any).id) {
        return res.redirect('/login'); // Session lost mid-flow
    }

    try {
        const userId = (req.user as any).id;
        // Mock payload creation
        const expiry = new Date();
        expiry.setSeconds(expiry.getSeconds() + 3600);

        const appSecretKey = process.env.SESSION_SECRET || 'fallback-secret-for-drive-encryption-12345678901234567890123456789012'; 
        
        // Mock encryption helper
        const encrypt = (text: string) => {
            const iv = crypto.randomBytes(16);
            const key = crypto.scryptSync(appSecretKey, 'salt', 32);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        };

        const existingConnection = await db.query.integrationConnections.findFirst({
            where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'calendar'))
        });

        const payload = {
            userId,
            provider: 'google',
            integrationType: 'calendar',
            externalAccountId: 'demo_calendar@gmail.com',
            displayName: 'Demo Calendar Account',
            grantedScopes: ['calendar.events'],
            accessTokenEncrypted: encrypt('mock_calendar_access_token'),
            refreshTokenEncrypted: encrypt('mock_calendar_refresh_token'),
            tokenExpiryAt: expiry,
            updatedAt: new Date()
        };

        if (existingConnection) {
            await db.update(integrationConnections).set(payload).where(eq(integrationConnections.id, existingConnection.id));
        } else {
            await db.insert(integrationConnections).values(payload as any);
        }

        delete (req as any).session.calendarAuthState;
        res.redirect('/settings?success=calendar_connected');
    } catch (err: any) {
        console.error('Calendar Integration Error:', err.message);
        res.redirect('/settings?error=connection_failed');
    }
});

googleCalendarIntegrationRoutes.get('/status', requireAuth, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const connection = await db.query.integrationConnections.findFirst({
            where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'calendar'))
        });

        if (!connection) {
            return res.json({ isConnected: false });
        }

        res.json({
            isConnected: true,
            externalAccountId: connection.externalAccountId,
            displayName: connection.displayName,
            updatedAt: connection.updatedAt
        });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to verify Calendar status.' });
    }
});

googleCalendarIntegrationRoutes.post('/disconnect', requireAuth, async (req, res) => {
    try {
        const userId = (req.user as any).id;
        const connection = await db.query.integrationConnections.findFirst({
            where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'calendar'))
        });

        if (connection) {
            await db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id));
        }
        res.json({ success: true, message: 'Google Calendar disconnected successfully.' });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to disconnect Google Calendar.' });
    }
});
