import pino from 'pino';
import { env, isProduction } from '../config/env.js';

// Create logger instance
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProduction()
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
    ],
    remove: true,
  },
});

// Typed logging helpers
export const log = {
  info: (msg: string, data?: object) => logger.info(data, msg),
  warn: (msg: string, data?: object) => logger.warn(data, msg),
  error: (msg: string, error?: Error | object) => logger.error(error, msg),
  debug: (msg: string, data?: object) => logger.debug(data, msg),
  fatal: (msg: string, error?: Error | object) => logger.fatal(error, msg),
};

// Request ID generator
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Child logger with context
export function createContextLogger(context: object) {
  return logger.child(context);
}
