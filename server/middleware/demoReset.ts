import { Request, Response, NextFunction } from 'express';
import { maybeResetDemo } from '../demo-reset';

/**
 * Section 5: Add middleware: demoResetMiddleware
 * First request after boot: checks if stale and resets if needed.
 * ASYNC and NON-BLOCKING.
 */
let firstHitHandled = false;

export function demoResetMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only execute in demo mode and only once per boot
  if (
    process.env.APP_MODE === 'demo' &&
    !firstHitHandled
  ) {
    firstHitHandled = true;
    
    console.log(`[DEMO] First request telemetry - Path: ${req.path}, IP: ${req.ip}, User-Agent: ${req.headers['user-agent']}`);
    
    // Async check to avoid blocking the first request
    maybeResetDemo().catch(err =>
      console.error('[DEMO] Background lazy reset check failed:', err)
    );
  }
  next();
}
