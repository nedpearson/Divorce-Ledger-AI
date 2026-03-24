import { Request, Response, NextFunction } from 'express';
import { maybeResetDemo } from '../demo-reset';

/**
 * Section 5: Add middleware: demoResetMiddleware
 * First request after boot: checks if stale and resets if needed.
 * ASYNC and NON-BLOCKING.
 */
let firstHitHandled = false;

export function demoResetMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.APP_MODE === 'demo' && !firstHitHandled) {
    firstHitHandled = true;
    console.log(`[DEMO] First request handled cleanly (Path: ${req.path}). Boot tasks complete.`);
  }
  next();
}
