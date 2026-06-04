import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dbEnv } from "./env";
import * as schema from "./schema";

// Direct Postgres client. Use from:
//   • Build-time RSC reads (generateStaticParams, server components on static routes)
//   • Migrations (drizzle-kit migrate)
//   • The WP migration script (scripts/migrate-wp.ts)
//   • Long-running ops that need a session-scoped connection
// DO NOT use this from /api/* routes — those go through pooled.ts.
//
// `max: 1` keeps build-time concurrency predictable on Supabase free-tier
// (60-connection cap). RSC pages built in parallel still share this single client
// instance via module caching; postgres.js handles request queueing internally.

const queryClient = postgres(dbEnv.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
