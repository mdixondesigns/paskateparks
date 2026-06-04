import "server-only";

// Env validation for the DB layer. Throws at import time if anything required
// is missing, so the failure surfaces during build/dev start, not at first DB query.
//
// Naming follows Supabase's official Drizzle/Prisma convention:
//   • DATABASE_URL — transaction-mode pooler (port 6543). The everyday URL.
//                    Used by /api/* serverless routes; prepare:false in code.
//   • DIRECT_URL   — session-mode pooler (port 5432). For DDL + long-lived ops.
//                    Used by migrations, build-time RSC, the WP migration script.

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
  /** Transaction-mode pooler URL — port 6543. /api/* routes, serverless runtime. */
  DATABASE_URL: required("DATABASE_URL"),
  /** Session-mode pooler URL — port 5432. Build-time RSC, migrations, the WP migration script. */
  DIRECT_URL: required("DIRECT_URL"),
};
