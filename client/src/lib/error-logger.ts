type ErrorLogLevel = 'error' | 'warn' | 'info';

interface FrontendErrorReport {
  type: 'frontend-error';
  level: ErrorLogLevel;
  route: string;
  message: string;
  stack?: string;
  userId?: string;
  environment: 'demo' | 'live' | 'unknown';
  timestamp: string;
  componentStack?: string;
}

const isDev = import.meta.env.DEV;

function getEnvironment(): 'demo' | 'live' | 'unknown' {
  const hostname = window.location.hostname;
  if (hostname.includes('localhost') || hostname.includes('replit.dev')) {
    return 'demo';
  }
  if (hostname === 'divorceledger.live') {
    return 'live';
  }
  return 'unknown';
}

function getUserId(): string | undefined {
  try {
    const stored = localStorage.getItem('userId');
    return stored || undefined;
  } catch {
    return undefined;
  }
}

export function logFrontendError(
  error: Error | string,
  options: {
    level?: ErrorLogLevel;
    componentStack?: string;
  } = {}
): void {
  const { level = 'error', componentStack } = options;
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  const report: FrontendErrorReport = {
    type: 'frontend-error',
    level,
    route: window.location.pathname,
    message: errorObj.message,
    stack: errorObj.stack,
    userId: getUserId(),
    environment: getEnvironment(),
    timestamp: new Date().toISOString(),
    componentStack,
  };

  if (isDev) {
    console.error('[Frontend Error]', report);
  } else {
    sendToBackend(report);
  }
}

async function sendToBackend(report: FrontendErrorReport): Promise<void> {
  try {
    await fetch('/api/log/frontend-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
  } catch {
    console.error('[ErrorLogger] Failed to send error report');
  }
}

export function setupGlobalErrorHandlers(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    logFrontendError(error || String(message), { level: 'error' });
    return false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    logFrontendError(error, { level: 'error' });
  });
}
