import { Router, Request, Response } from 'express';
import { quickBooksService } from '../services/quickbooks.service';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'demo-user';
    const status = await quickBooksService.getConnectionStatus(userId);
    
    res.json({
      connected: status.connected,
      companyName: status.companyName,
      connectedAt: status.connectedAt?.toISOString() || null,
      lastSyncAt: status.lastSyncAt?.toISOString() || null,
      apiCallsRemaining: status.apiCallsRemaining,
      configured: quickBooksService.isConfigured(),
    });
  } catch (error) {
    console.error('QB status error:', error);
    res.status(500).json({ error: 'Failed to get QuickBooks status' });
  }
});

router.get('/auth-url', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'demo-user';
    
    if (!quickBooksService.isConfigured()) {
      return res.status(503).json({ 
        error: 'QuickBooks integration not configured',
        message: 'Contact administrator to set up QB_CLIENT_ID and QB_CLIENT_SECRET'
      });
    }
    
    const authUrl = quickBooksService.getAuthorizationUrl(userId);
    await quickBooksService.logAction(userId, 'auth_url_generated');
    
    res.json({ authUrl });
  } catch (error) {
    console.error('QB auth-url error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, realmId, error: qbError, error_description } = req.query;
    
    if (qbError) {
      console.error('QB OAuth error:', qbError, error_description);
      return res.redirect('/settings?qb_error=' + encodeURIComponent(String(error_description || qbError)));
    }
    
    if (!code || !state || !realmId) {
      return res.redirect('/settings?qb_error=missing_params');
    }
    
    const stateData = quickBooksService.validateState(String(state));
    if (!stateData) {
      return res.redirect('/settings?qb_error=invalid_state');
    }
    
    const userId = stateData.userId;
    
    const tokens = await quickBooksService.exchangeCodeForTokens(String(code), String(realmId));
    
    const companyInfo = await quickBooksService.fetchCompanyInfo(tokens.accessToken, String(realmId));
    
    await quickBooksService.storeUserTokens(
      userId, 
      tokens, 
      String(realmId), 
      companyInfo?.companyName
    );
    
    await quickBooksService.logAction(
      userId, 
      'oauth_complete', 
      'company', 
      String(realmId),
      'POST',
      '/oauth2/v1/tokens/bearer',
      200
    );
    
    res.redirect('/settings?qb_success=true');
  } catch (error) {
    console.error('QB callback error:', error);
    res.redirect('/settings?qb_error=callback_failed');
  }
});

router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'demo-user';
    
    await quickBooksService.disconnectUser(userId, 'User requested disconnect');
    
    res.json({ success: true, message: 'QuickBooks disconnected successfully' });
  } catch (error) {
    console.error('QB disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

router.get('/sync-logs', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'demo-user';
    const limit = parseInt(req.query.limit as string) || 20;
    
    const { db } = await import('../db');
    const { quickbooksSyncLog } = await import('@shared/schema');
    const { eq, desc } = await import('drizzle-orm');
    
    const logs = await db.select()
      .from(quickbooksSyncLog)
      .where(eq(quickbooksSyncLog.userId, userId))
      .orderBy(desc(quickbooksSyncLog.createdAt))
      .limit(limit);
    
    res.json({ logs });
  } catch (error) {
    console.error('QB sync-logs error:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

router.get('/rate-limit', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'demo-user';
    const rateLimit = await quickBooksService.checkRateLimit(userId);
    
    res.json({
      allowed: rateLimit.allowed,
      remaining: rateLimit.remaining,
      limit: 100,
      resetsAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
    });
  } catch (error) {
    console.error('QB rate-limit error:', error);
    res.status(500).json({ error: 'Failed to check rate limit' });
  }
});

export default router;
