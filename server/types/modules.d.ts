declare module 'hpp';
declare module 'xss-clean';

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    LIVE_DB_URL?: string;
    DEMO_DB_URL?: string;
    SESSION_SECRET?: string;
    NODE_ENV?: string;
    PORT?: string;
  }
}
