/**
 * errorHandler.ts - Centralized Error Handling Utilities
 * 
 * Provides consistent error responses and async handler wrapping
 * to prevent UnhandledPromiseRejection warnings.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createLogger } from './logger';
import { DatabaseError } from './safeQuery';

const logger = createLogger('ErrorHandler');

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    traceId?: string;
  };
}

/**
 * Creates a consistent error response
 */
export function createErrorResponse(
  message: string, 
  code?: string, 
  traceId?: string
): ErrorResponse {
  return {
    error: {
      message,
      ...(code && { code }),
      ...(traceId && { traceId }),
    },
  };
}

/**
 * Generates a trace ID for error tracking
 */
export function generateTraceId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Wraps an async Express handler to catch errors and prevent unhandled rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      const traceId = generateTraceId();
      
      logger.error('Async handler error', error, {
        traceId,
        path: req.path,
        method: req.method,
        userId: (req as any).session?.userId,
      });
      
      if (!res.headersSent) {
        res.status(500).json(createErrorResponse(
          'Internal server error',
          'INTERNAL_ERROR',
          traceId
        ));
      }
    });
  };
}

/**
 * Global error handler middleware for Express
 */
export function globalErrorHandler(
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const traceId = generateTraceId();
  
  logger.error('Global error handler caught error', err, {
    traceId,
    path: req.path,
    method: req.method,
    userId: (req as any).session?.userId,
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json(createErrorResponse(
    process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    'INTERNAL_ERROR',
    traceId
  ));
}

/**
 * Sends a standardized 400 Bad Request response
 */
export function badRequest(res: Response, message: string, code?: string): void {
  res.status(400).json(createErrorResponse(message, code || 'BAD_REQUEST'));
}

/**
 * Sends a standardized 401 Unauthorized response
 */
export function unauthorized(res: Response, message: string = 'Unauthorized'): void {
  res.status(401).json(createErrorResponse(message, 'UNAUTHORIZED'));
}

/**
 * Sends a standardized 404 Not Found response
 */
export function notFound(res: Response, message: string = 'Not found'): void {
  res.status(404).json(createErrorResponse(message, 'NOT_FOUND'));
}

/**
 * Sends a standardized 500 Internal Server Error response
 */
export function internalError(
  res: Response, 
  message: string = 'Internal server error',
  traceId?: string
): void {
  res.status(500).json(createErrorResponse(
    message, 
    'INTERNAL_ERROR', 
    traceId || generateTraceId()
  ));
}

/**
 * Handles errors in route handlers, sanitizing database errors
 * and preventing raw error.message exposure
 */
export function handleRouteError(
  res: Response,
  error: unknown,
  fallbackMessage: string = 'Operation failed'
): void {
  if (error instanceof DatabaseError) {
    res.status(500).json(createErrorResponse(
      'Database operation failed',
      'DATABASE_ERROR',
      error.traceId
    ));
  } else {
    const traceId = generateTraceId();
    logger.error(fallbackMessage, error instanceof Error ? error : new Error(String(error)), { traceId });
    res.status(500).json(createErrorResponse(
      fallbackMessage,
      'INTERNAL_ERROR',
      traceId
    ));
  }
}

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Standard failure response structure (alternative to ErrorResponse)
 */
export interface FailureResponse {
  success: false;
  error: string;
  code?: string;
  traceId?: string;
}

/**
 * Creates a consistent success response
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Creates a consistent failure response
 */
export function createFailureResponse(
  message: string,
  code?: string,
  traceId?: string
): FailureResponse {
  return {
    success: false,
    error: message,
    ...(code && { code }),
    ...(traceId && { traceId }),
  };
}

/**
 * Sends a standardized success response
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json(createSuccessResponse(data));
}

/**
 * Sends a standardized failure response
 */
export function sendFailure(
  res: Response,
  message: string,
  statusCode: number = 400,
  code?: string
): void {
  res.status(statusCode).json(createFailureResponse(message, code));
}
