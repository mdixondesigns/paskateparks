import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dbEnv } from "./env";
import * as schema from "./schema";

// Pooled Postgres client. Use from:
//   • /api/* serverless functions
//   • Anything in the Vercel serverless runtime
//   • Anything that runs under cold-start fanout
//
// CRITICAL (A1, STACK-PIVOT.md finding #5): `prepare: false` is required because
// Supabase's pooler runs PgBouncer in transaction mode, which can't reuse prepared
// statements between connections. Without this flag you get
// `prepared statement "X" already exists` / `does not exist` errors under load.

const pooledClient = postgres(dbEnv.DATABASE_POOL_URL, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const dbPooled = drizzle(pooledClient, { schema });

export type PooledDatabase = typeof dbPooled;
