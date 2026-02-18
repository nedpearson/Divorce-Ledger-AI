import { Router } from 'express';
import { resetDemoEnvironment, eraseDemoData, eraseEnvironmentData } from '../demo-reset';
import { isLiveMode, isDemoMode, getAppMode } from '../config';

const router = Router();

/**
 * LIVE MODE HARDENING:
 * All demo reset endpoints are strictly guarded to prevent accidental execution
 * in live/production mode. These checks are redundant but critical for safety.
 */

const LIVE_MODE_BLOCK_MESSAGE = 'BLOCKED: This endpoint is disabled in live/production mode to protect data integrity.';

/**
 * POST /internal/admin/demo/reset
 * Manual demo reset endpoint - DEMO MODE ONLY
 * Authenticated via secret header.
 */
router.post('/internal/admin/demo/reset', async (req, res) => {
  // CRITICAL: Block in live mode - double safety check
  if (isLiveMode()) {
    console.error(`[SECURITY] BLOCKED: Demo reset attempt in LIVE mode from IP: ${req.ip}`);
    return res.status(403).json({ 
      error: LIVE_MODE_BLOCK_MESSAGE,
      code: 'LIVE_MODE_PROTECTED'
    });
  }

  // Only run in demo mode
  if (!isDemoMode()) {
    console.warn(`[DEMO] Reset rejected: APP_MODE is not demo (current: ${process.env.APP_MODE})`);
    return res.status(403).json({ error: 'Endpoint restricted to demo environments.' });
  }

  // Authenticate via secret header
  const secret = req.headers['x-demo-reset-key'];
  if (!secret || secret !== process.env.DEMO_RESET_KEY) {
    console.warn(`[DEMO] Unauthorized manual reset attempt from IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid reset key.' });
  }

  try {
    console.log(`[DEMO] Manual reset triggered via internal endpoint. Initiator: ${req.ip}`);
    
    await resetDemoEnvironment();
    
    console.log('[DEMO] Manual reset successful.');
    return res.json({ ok: true, mode: 'demo' });
  } catch (err) {
    console.error('[DEMO] Manual reset failed:', err);
    return res.status(500).json({ error: 'Internal server error during demo reset.' });
  }
});

/**
 * POST /internal/admin/demo/erase
 * Erase all demo data without reseeding - DEMO MODE ONLY
 */
router.post('/internal/admin/demo/erase', async (req, res) => {
  // CRITICAL: Block in live mode
  if (isLiveMode()) {
    console.error(`[SECURITY] BLOCKED: Demo erase attempt in LIVE mode from IP: ${req.ip}`);
    return res.status(403).json({ 
      error: LIVE_MODE_BLOCK_MESSAGE,
      code: 'LIVE_MODE_PROTECTED'
    });
  }

  if (!isDemoMode()) {
    return res.status(403).json({ error: 'Endpoint restricted to demo environments.' });
  }

  const secret = req.headers['x-demo-reset-key'];
  if (!secret || secret !== process.env.DEMO_RESET_KEY) {
    console.warn(`[DEMO] Unauthorized erase attempt from IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid reset key.' });
  }

  try {
    console.log(`[DEMO] Manual erase triggered. Initiator: ${req.ip}`);
    await eraseDemoData();
    console.log('[DEMO] Manual erase successful.');
    return res.json({ ok: true, mode: 'demo' });
  } catch (err) {
    console.error('[DEMO] Manual erase failed:', err);
    return res.status(500).json({ error: 'Internal server error during demo erase.' });
  }
});

/**
 * GET /internal/admin/mode
 * Returns current application mode for debugging
 */
router.get('/internal/admin/mode', (_req, res) => {
  return res.json({
    appMode: getAppMode(),
    nodeEnv: process.env.NODE_ENV || 'not_set',
    cronEnabled: process.env.CRON_ENABLED === 'true',
    isLiveMode: isLiveMode(),
    isDemoMode: isDemoMode(),
  });
});

export default router;
