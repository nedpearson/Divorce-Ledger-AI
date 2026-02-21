import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Use DIRECT_URL for migrations (bypasses connection pooler)
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
