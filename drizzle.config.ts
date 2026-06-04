import { defineConfig } from "drizzle-kit";
import { config as loadDotenv } from "dotenv";

// Load .env.local for drizzle-kit CLI commands (generate / migrate / studio).
// Next.js loads it automatically for app code; drizzle-kit runs as a standalone
// CLI so we need to do it manually here.
loadDotenv({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit migrate/push/studio use the session-mode pooler (port 5432)
    // because migrations are DDL (CREATE TYPE, ALTER TABLE) and need session-level
    // features that transaction-mode pooling would break. Per Supabase's Drizzle
    // convention, this is DIRECT_URL.
    url: process.env.DIRECT_URL ?? "",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
