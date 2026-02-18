/**
 * safeQuery.ts - Universal Database Safety Wrapper
 * 
 * Provides a safe query execution layer that:
 * - Validates parameters before execution
 * - Catches and logs all DB exceptions with structured format
 * - Never exposes raw SQL or stack traces to callers
 * - Generates trace IDs for error correlation
 * 
 * Environment-based logging:
 * - DEBUG_SQL=true: Enable debug logging of all queries (dev only)
 * - NODE_ENV=production: Only log errors and critical events
 */

import { Pool, QueryResult, QueryResultRow } from 'pg';
import { createLogger } from './logger';
import { generateTraceId } from './errorHandler';

const logger = createLogger('SafeQuery');

// Environment-based debug logging configuration
const isProduction = process.env.NODE_ENV === 'production';
const debugSqlEnabled = process.env.DEBUG_SQL === 'true' && !isProduction;

// Log configuration on startup (once)
if (debugSqlEnabled) {
  logger.info('SQL debug logging enabled (DEBUG_SQL=true)', {});
}

export interface QueryErrorContext {
  level: 'error';
  queryName: string;
  message: string;
  code?: string;
  severity?: string;
  table?: string;
  position?: string;
  stack?: string;
  traceId: string;
  duration?: number;
  [key: string]: unknown;
}

export class DatabaseError extends Error {
  public readonly traceId: string;
  public readonly queryName: string;
  public readonly code: string;

  constructor(message: string, queryName: string, traceId: string, code: string = 'DB_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.traceId = traceId;
    this.queryName = queryName;
    this.code = code;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

interface PostgresError extends Error {
  code?: string;
  severity?: string;
  table?: string;
  position?: string;
  detail?: string;
  hint?: string;
  constraint?: string;
  schema?: string;
  column?: string;
  dataType?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return error instanceof Error && 'code' in error;
}

function validateParams(params: unknown[]): { valid: boolean; error?: string } {
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (param === undefined) {
      return { valid: false, error: `Parameter at index ${i} is undefined` };
    }
    if (typeof param === 'function') {
      return { valid: false, error: `Parameter at index ${i} is a function (not serializable)` };
    }
    if (typeof param === 'symbol') {
      return { valid: false, error: `Parameter at index ${i} is a symbol (not serializable)` };
    }
  }
  return { valid: true };
}

function sanitizeErrorMessage(error: PostgresError): string {
  const pgCode = error.code || 'UNKNOWN';
  
  const codeMessages: Record<string, string> = {
    '23505': 'Duplicate entry violation',
    '23503': 'Foreign key constraint violation',
    '23502': 'Required field is missing',
    '23514': 'Check constraint violation',
    '22P02': 'Invalid input format',
    '22001': 'Value too long for field',
    '42601': 'Query syntax error',
    '42703': 'Unknown column reference',
    '42P01': 'Table does not exist',
    '42P02': 'Unknown parameter reference',
    '08003': 'Database connection not available',
    '08006': 'Database connection failure',
    '40001': 'Transaction conflict - please retry',
    '40P01': 'Deadlock detected - please retry',
    '57014': 'Query cancelled due to timeout',
    '53300': 'Too many database connections',
    '53400': 'Server configuration limit reached',
  };

  return codeMessages[pgCode] || 'Database operation failed';
}

function getErrorCode(error: PostgresError): string {
  const pgCode = error.code || 'UNKNOWN';
  
  const codeMapping: Record<string, string> = {
    '23505': 'DUPLICATE_ENTRY',
    '23503': 'FK_VIOLATION',
    '23502': 'MISSING_REQUIRED',
    '23514': 'CHECK_VIOLATION',
    '22P02': 'INVALID_FORMAT',
    '22001': 'VALUE_TOO_LONG',
    '42601': 'SYNTAX_ERROR',
    '42703': 'UNKNOWN_COLUMN',
    '42P01': 'TABLE_NOT_FOUND',
    '42P02': 'UNKNOWN_PARAM',
    '08003': 'CONNECTION_LOST',
    '08006': 'CONNECTION_FAILED',
    '40001': 'TRANSACTION_CONFLICT',
    '40P01': 'DEADLOCK',
    '57014': 'QUERY_TIMEOUT',
    '53300': 'TOO_MANY_CONNECTIONS',
    '53400': 'CONFIG_LIMIT',
  };

  return codeMapping[pgCode] || `PG_${pgCode}`;
}

export interface SafeQueryOptions {
  logSuccess?: boolean;
  timeout?: number;
}

export interface QueryExecutor {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export async function safeQuery<T extends QueryResultRow = QueryResultRow>(
  executor: Pool | QueryExecutor,
  queryName: string,
  sql: string,
  params: unknown[] = [],
  options: SafeQueryOptions = {}
): Promise<QueryResult<T>> {
  const traceId = generateTraceId();
  const startTime = Date.now();
  const { logSuccess = false } = options;

  const validation = validateParams(params);
  if (!validation.valid) {
    const errorContext: QueryErrorContext = {
      level: 'error',
      queryName,
      message: validation.error!,
      code: 'INVALID_PARAMS',
      traceId,
    };
    logger.error('Query parameter validation failed', undefined, errorContext);
    throw new DatabaseError(
      'Invalid query parameters',
      queryName,
      traceId,
      'INVALID_PARAMS'
    );
  }

  try {
    const queryFn = (executor as QueryExecutor).query.bind(executor);
    const result = await queryFn<T>(sql, params);
    const duration = Date.now() - startTime;

    // Log on explicit request OR when debug SQL logging is enabled
    if (logSuccess || debugSqlEnabled) {
      logger.debug(`Query executed: ${queryName}`, {
        duration,
        rowCount: result.rowCount,
        traceId,
        ...(debugSqlEnabled && { paramCount: params.length }),
      });
    }

    return result;
  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    if (isPostgresError(error)) {
      const errorContext: QueryErrorContext = {
        level: 'error',
        queryName,
        message: error.message,
        code: error.code,
        severity: error.severity,
        table: error.table,
        position: error.position,
        stack: error.stack,
        traceId,
        duration,
      };

      logger.error(`Query failed: ${queryName}`, error, errorContext);

      throw new DatabaseError(
        sanitizeErrorMessage(error),
        queryName,
        traceId,
        getErrorCode(error)
      );
    }

    const unknownError = error instanceof Error ? error : new Error(String(error));
    
    const errorContext: QueryErrorContext = {
      level: 'error',
      queryName,
      message: unknownError.message,
      stack: unknownError.stack,
      traceId,
      duration,
    };

    logger.error(`Query failed with unknown error: ${queryName}`, unknownError, errorContext);

    throw new DatabaseError(
      'Database operation failed',
      queryName,
      traceId,
      'UNKNOWN_ERROR'
    );
  }
}

export async function safeQueryFirst<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  queryName: string,
  sql: string,
  params: unknown[] = [],
  options: SafeQueryOptions = {}
): Promise<T | null> {
  const result = await safeQuery<T>(pool, queryName, sql, params, options);
  return result.rows[0] || null;
}

export async function safeQueryAll<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  queryName: string,
  sql: string,
  params: unknown[] = [],
  options: SafeQueryOptions = {}
): Promise<T[]> {
  const result = await safeQuery<T>(pool, queryName, sql, params, options);
  return result.rows;
}

export async function safeQueryCount(
  pool: Pool,
  queryName: string,
  sql: string,
  params: unknown[] = [],
  options: SafeQueryOptions = {}
): Promise<number> {
  const result = await safeQuery(pool, queryName, sql, params, options);
  return result.rowCount || 0;
}

export async function safeTransaction<T>(
  pool: Pool,
  transactionName: string,
  fn: (client: any) => Promise<T>
): Promise<T> {
  const traceId = generateTraceId();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK');

    if (isPostgresError(error)) {
      const errorContext: QueryErrorContext = {
        level: 'error',
        queryName: transactionName,
        message: error.message,
        code: error.code,
        severity: error.severity,
        table: error.table,
        stack: error.stack,
        traceId,
      };

      logger.error(`Transaction failed: ${transactionName}`, error, errorContext);

      throw new DatabaseError(
        sanitizeErrorMessage(error),
        transactionName,
        traceId,
        getErrorCode(error)
      );
    }

    if (error instanceof DatabaseError) {
      throw error;
    }

    const unknownError = error instanceof Error ? error : new Error(String(error));
    logger.error(`Transaction failed with unknown error: ${transactionName}`, unknownError, {
      traceId,
    });

    throw new DatabaseError(
      'Transaction failed',
      transactionName,
      traceId,
      'TRANSACTION_FAILED'
    );
  } finally {
    client.release();
  }
}

export function createQueryWrapper(pool: Pool) {
  return {
    query: <T extends QueryResultRow = QueryResultRow>(
      queryName: string,
      sql: string,
      params: unknown[] = [],
      options: SafeQueryOptions = {}
    ) => safeQuery<T>(pool, queryName, sql, params, options),

    first: <T extends QueryResultRow = QueryResultRow>(
      queryName: string,
      sql: string,
      params: unknown[] = [],
      options: SafeQueryOptions = {}
    ) => safeQueryFirst<T>(pool, queryName, sql, params, options),

    all: <T extends QueryResultRow = QueryResultRow>(
      queryName: string,
      sql: string,
      params: unknown[] = [],
      options: SafeQueryOptions = {}
    ) => safeQueryAll<T>(pool, queryName, sql, params, options),

    count: (
      queryName: string,
      sql: string,
      params: unknown[] = [],
      options: SafeQueryOptions = {}
    ) => safeQueryCount(pool, queryName, sql, params, options),

    transaction: <T>(
      transactionName: string,
      fn: (client: any) => Promise<T>
    ) => safeTransaction<T>(pool, transactionName, fn),
  };
}

export type SafeQueryClient = ReturnType<typeof createQueryWrapper>;
