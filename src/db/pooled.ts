import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dbEnv } from "./env";
import * as schema from "./schema";

// Pooled client — uses Supabase's TRANSACTION-mode pooler (port 6543).
// Each query holds a connection only during a single SQL transaction, then
// returns it to the pool. Many serverless requests share a small handful of
// underlying Postgres connections — essential for surviving cold-start fanout.
//
// Use from:
//   • /api/* serverless functions
//   • Anything in the Vercel serverless runtime
//
// CRITICAL (A1, STACK-PIVOT.md finding #5): `prepare: false` is required.
// Supavisor in transaction mode (like PgBouncer) cannot reuse prepared
// statements between connections. Without this flag you get
// `prepared statement "X" already exists` / `does not exist` under load.

const pooledClient = postgres(dbEnv.DATABASE_URL, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const dbPooled = drizzle(pooledClient, { schema });

export type PooledDatabase = typeof dbPooled;
