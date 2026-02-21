import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { createQueryWrapper, SafeQueryClient } from "./lib/safeQuery";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL environment variable");
  console.error("Available env vars:", Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("PASSWORD")).join(", "));
}

const isSupabase = databaseUrl?.includes('supabase');

// Strip any conflicting SSL params from URL before passing to pg
const cleanDatabaseUrl = databaseUrl
  ? databaseUrl.replace(/[?&]sslmode=\w+/g, '').replace(/[?&]ssl=\w+/g, '')
  : databaseUrl;

export const pool = databaseUrl ? new Pool({
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

// Create a proxy that throws helpful errors when db is accessed without DATABASE_URL
const dbInstance = pool ? drizzle(pool, { schema }) : null;

export const db = dbInstance ? dbInstance : new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    if (prop === 'then' || prop === 'catch' || prop === Symbol.toStringTag) {
      // Don't intercept Promise methods
      return undefined;
    }
    throw new Error(`Database not available: DATABASE_URL environment variable is not set. Cannot access db.${String(prop)}`);
  }
}) as NodePgDatabase<typeof schema>;

export async function testDatabaseConnection(): Promise<boolean> {
  if (!pool) {
    console.error("Database pool not initialized - DATABASE_URL missing");
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
