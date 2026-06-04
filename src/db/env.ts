import "server-only";

// Env validation for the DB layer. Throws at import time if anything required
// is missing, so the failure surfaces during build/dev start, not at first DB query.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.example and ensure .env.local is populated (phase 2).`,
    );
  }
  return value;
}

export const dbEnv = {
  /** Direct Postgres URL — port 5432. Build-time RSC, migrations, the WP migration script. */
  DATABASE_URL: required("DATABASE_URL"),
  /** Pooled Postgres URL — port 6543 with ?pgbouncer=true. /api/* routes, serverless runtime. */
  DATABASE_POOL_URL: required("DATABASE_POOL_URL"),
};
