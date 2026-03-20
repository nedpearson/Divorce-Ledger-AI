import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

type LoopWatchdogOptions = {
  // Max allowed renders per route within timeWindowMs
  maxRendersPerRoute?: number;
  // Time window to track (ms)
  timeWindowMs?: number;
  // Optional endpoint to report suspicious behavior
  reportUrl?: string;
};

const DEFAULTS: Required<LoopWatchdogOptions> = {
  maxRendersPerRoute: 40, // generous to avoid false positives
  timeWindowMs: 5000, // 5 seconds
  reportUrl: '/api/loop-watchdog',
};

export function useLoopWatchdog(options?: LoopWatchdogOptions) {
  const config = { ...DEFAULTS, ...options };
  const [location] = useLocation();

  const stateRef = useRef<{
    currentPath: string;
    renderCount: number;
    firstRenderTs: number;
    lastReportTs: number;
  }>({
    currentPath: location,
    renderCount: 0,
    firstRenderTs: Date.now(),
    lastReportTs: 0,
  });

  useEffect(() => {
    const state = stateRef.current;

    // Route changed → reset counters
    if (location !== state.currentPath) {
      state.currentPath = location;
      state.renderCount = 0;
      state.firstRenderTs = Date.now();
      // leave lastReportTs as-is to avoid spamming when bouncing
    }

    const now = Date.now();
    const elapsed = now - state.firstRenderTs;

    if (elapsed > config.timeWindowMs) {
      // New window
      state.renderCount = 0;
      state.firstRenderTs = now;
    }

    state.renderCount += 1;

    if (
      state.renderCount >= config.maxRendersPerRoute &&
      now - state.lastReportTs > config.timeWindowMs
    ) {
      state.lastReportTs = now;

      const payload = {
        type: 'FRONTEND_RENDER_LOOP_SUSPECTED',
        path: state.currentPath,
        renderCount: state.renderCount,
        timeWindowMs: config.timeWindowMs,
        userAgent: window.navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      // 1) Log locally for you / Replit AI

      console.warn('[LoopWatchdog] Suspected render loop:', payload);

      // 2) Optionally send to backend (non-blocking, fire-and-forget)
      if (config.reportUrl) {
        try {
          void fetch(config.reportUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          });
        } catch {
          // swallow; logging is best-effort
        }
      }
    }
  });
}
