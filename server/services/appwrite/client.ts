import { Client, Databases, Storage, Users, ID, Query, Permission, Role } from 'node-appwrite';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Appwrite] Missing required environment variable: ${name}`);
  }
  return value;
}

export const DATABASE_ID = 'divorce_ledger_db';
export const STORAGE_BUCKET_ID = 'document_files';

export const COLLECTIONS = {
  FILES: 'files',
  ANALYSIS_RUNS: 'analysis_runs',
  CATEGORIES: 'categories',
  USER_OVERRIDES: 'user_overrides',
  IDEMPOTENCY: 'idempotency_records',
  USAGE: 'usage_records',
} as const;

export const FILE_STATUS = {
  UPLOADED: 'uploaded',
  QUEUED: 'queued',
  EXTRACTING: 'extracting',
  ANALYZING: 'analyzing',
  SUGGESTED: 'suggested',
  AWAITING_USER: 'awaiting_user',
  FINALIZED: 'finalized',
  ERROR: 'error',
} as const;

export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

let clientInitialized = false;
const client = new Client();

export function initializeAppwrite(): boolean {
  if (clientInitialized) return true;

  try {
    const endpoint = getRequiredEnv('APPWRITE_ENDPOINT');
    const projectId = getRequiredEnv('APPWRITE_PROJECT_ID');
    const apiKey = getRequiredEnv('APPWRITE_API_KEY');

    client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

    clientInitialized = true;
    console.log('[Appwrite] Client initialized successfully');
    return true;
  } catch (error) {
    console.error('[Appwrite] Initialization failed:', error);
    return false;
  }
}

export function isAppwriteConfigured(): boolean {
  return !!(
    process.env.APPWRITE_ENDPOINT &&
    process.env.APPWRITE_PROJECT_ID &&
    process.env.APPWRITE_API_KEY
  );
}

export const databases = new Databases(client);
export const storage = new Storage(client);
export const users = new Users(client);

export { client, ID, Query, Permission, Role };

export function getUserPermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

export function getServerPermissions() {
  return [
    Permission.read(Role.any()),
    Permission.update(Role.any()),
    Permission.delete(Role.any()),
  ];
}
