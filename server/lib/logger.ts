/**
 * logger.ts - Centralized Logging Utility
 *
 * Provides structured logging with levels and consistent formatting.
 * In production, debug logs are suppressed.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === 'production';
const minLevel = isProduction ? LOG_LEVELS.info : LOG_LEVELS.debug;

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${contextStr}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= minLevel;
}

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', this.module, message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (shouldLog('info')) {
      console.log(formatMessage('info', this.module, message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', this.module, message, context));
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (shouldLog('error')) {
      const errorContext =
        error instanceof Error
          ? { ...context, errorMessage: error.message, stack: error.stack }
          : { ...context, error };
      console.error(formatMessage('error', this.module, message, errorContext));
    }
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}

export const logger = {
  debug: (module: string, message: string, context?: LogContext) =>
    new Logger(module).debug(message, context),
  info: (module: string, message: string, context?: LogContext) =>
    new Logger(module).info(message, context),
  warn: (module: string, message: string, context?: LogContext) =>
    new Logger(module).warn(message, context),
  error: (module: string, message: string, error?: Error | unknown, context?: LogContext) =>
    new Logger(module).error(message, error, context),
};

export default Logger;
