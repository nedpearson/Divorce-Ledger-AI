import { Client, Databases } from 'appwrite';

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '696dc1cb0033cf776b3b';
const DATABASE_ID = 'divorce_ledger_db';

export const COLLECTIONS = {
  FILES: 'files',
  ANALYSIS_RUNS: 'analysis_runs',
  CATEGORIES: 'categories',
  USER_OVERRIDES: 'user_overrides',
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

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

export const databases = new Databases(client);

export { client, DATABASE_ID };
