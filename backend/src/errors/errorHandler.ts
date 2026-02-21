import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { AppError, formatErrorResponse } from './AppError.js';
import { logger } from '../logging/logger.js';
import { isDevelopment } from '../config/env.js';

// Global error handler for Fastify
export async function errorHandler(
  error: Error | FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id;

  // Log error
  if (error instanceof AppError && error.isOperational) {
    logger.warn(
      {
        err: error,
        requestId,
        url: request.url,
        method: request.method,
      },
      'Operational error occurred'
    );
  } else {
    logger.error(
      {
        err: error,
        requestId,
        url: request.url,
        method: request.method,
        body: request.body,
      },
      'Unexpected error occurred'
    );
  }

  // Determine status code
  let statusCode = 500;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
  }

  // Format and send error response
  const response = formatErrorResponse(error, requestId, isDevelopment());

  reply.status(statusCode).send(response);
}

// Not found handler
export async function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  const response = formatErrorResponse(
    new AppError(`Route ${request.method} ${request.url} not found`, 404, 'NOT_FOUND'),
    request.id
  );

  reply.status(404).send(response);
}

// Handle uncaught exceptions
export function setupProcessHandlers() {
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'Uncaught exception detected');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.fatal({ reason }, 'Unhandled rejection detected');
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}
