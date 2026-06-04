import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dbEnv } from "./env";
import * as schema from "./schema";

// "Direct" client — actually goes through the SESSION-mode pooler (port 5432)
// on Supabase free tier because the truly-direct endpoint is IPv6-only.
// Session mode preserves prepared statements and supports DDL, so this behaves
// like a direct connection for our purposes.
//
// Use from:
//   • Build-time RSC reads (generateStaticParams, server components on static routes)
//   • Migrations (scripts/db-migrate.ts, drizzle-kit)
//   • The WP migration script (scripts/migrate-wp.ts) — phase 5
//   • Long-running ops that need a session-scoped connection
// DO NOT use this from /api/* routes — those go through pooled.ts.
//
// `max: 1` keeps build-time concurrency predictable on Supabase free-tier
// connection budget. postgres.js handles request queueing internally when
// multiple callers share the same client instance via module caching.

const queryClient = postgres(dbEnv.DIRECT_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
