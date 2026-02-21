import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { createQueryWrapper, SafeQueryClient } from "./lib/safeQuery";

const { Pool } = pg;

// Prefer DIRECT_URL (direct Supabase host) when available, fall back to DATABASE_URL
const rawDatabaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  console.error("Missing DIRECT_URL/DATABASE_URL environment variables");
  console.error("Available env vars:", Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("PASSWORD")).join(", "));
}

const isSupabase = rawDatabaseUrl?.includes('supabase');

// Strip any conflicting SSL params from URL before passing to pg
const cleanDatabaseUrl = rawDatabaseUrl
  ? rawDatabaseUrl.replace(/[?&]sslmode=\w+/g, '').replace(/[?&]ssl=\w+/g, '')
  : rawDatabaseUrl;

export const pool = rawDatabaseUrl ? new Pool({
  connectionString: cleanDatabaseUrl,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  max: 10,
  // Supabase requires SSL; disable cert verification for pooler
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
}) : null;

if (pool) {
  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err.message);
  });
}

// Create a proxy that throws helpful errors when db is accessed without DATABASE_URL/DIRECT_URL
const dbInstance = pool ? drizzle(pool, { schema }) : null;

export const db = dbInstance ? dbInstance : new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    if (prop === 'then' || prop === 'catch' || prop === Symbol.toStringTag) {
      // Don't intercept Promise methods
      return undefined;
    }
    throw new Error(`Database not available: DIRECT_URL/DATABASE_URL environment variables are not set. Cannot access db.${String(prop)}`);
  }
}) as NodePgDatabase<typeof schema>;

export async function testDatabaseConnection(): Promise<boolean> {
  if (!pool) {
    console.error("Database pool not initialized - DIRECT_URL/DATABASE_URL missing");
    return false;
  }
  
  const maxRetries = 5;
  const retryDelay = 3000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("Database connection successful");
      return true;
    } catch (error: any) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  console.error("Failed to connect to database after all retries");
  return false;
}

type DbInstance = NodePgDatabase<typeof schema>;

const dbInstances: Map<string, { pool: pg.Pool; db: DbInstance }> = new Map();

function createDbInstance(connectionString: string): { pool: pg.Pool; db: DbInstance } {
  const newPool = new Pool({ connectionString });
  const newDb = drizzle(newPool, { schema });
  return { pool: newPool, db: newDb };
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool;
}

export function getDb(environment: string): DbInstance {
  if (environment === "live" && process.env.LIVE_DB_URL) {
    if (!dbInstances.has("live")) {
      dbInstances.set("live", createDbInstance(process.env.LIVE_DB_URL));
    }
    return dbInstances.get("live")!.db;
  }
  
  if (environment === "demo" && process.env.DEMO_DB_URL) {
    if (!dbInstances.has("demo")) {
      dbInstances.set("demo", createDbInstance(process.env.DEMO_DB_URL));
    }
    return dbInstances.get("demo")!.db;
  }
  
  return db;
}

let _safeQuery: SafeQueryClient | null = null;

export function getSafeQuery(): SafeQueryClient {
  if (!_safeQuery) {
    _safeQuery = createQueryWrapper(getPool());
  }
  return _safeQuery;
}

export { DatabaseError, type SafeQueryClient } from './lib/safeQuery';
