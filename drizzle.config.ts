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
    // Migrations and introspection use the DIRECT connection. Migrations need
    // session-level features (CREATE TYPE, ALTER TABLE) that pgbouncer would break.
    url: process.env.DATABASE_URL ?? "",
  },
  // Use SQL filename pattern compatible with Supabase CLI's migration ordering:
  // <timestamp>_<name>.sql. drizzle-kit's default works directly with supabase db push.
  casing: "snake_case",
  verbose: true,
  strict: true,
});
