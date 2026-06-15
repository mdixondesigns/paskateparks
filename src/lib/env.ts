import "server-only";

// App-level env vars (phase 9). DB connection strings live in src/db/env.ts —
// this module is for everything else the runtime layer needs: webhook bearer
// secret, admin session HMAC key, admin login password.
//
// All three throw at import time if missing, so misconfiguration fails the
// dev-server start / Vercel build, not the first request that needs them.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.example. REVALIDATE_SECRET + ADMIN_SECRET are 'openssl rand -hex 32' ` +
        `output; ADMIN_PASSWORD is owner-chosen.`,
    );
  }
  return value;
}

export const appEnv = {
  /** Bearer the Supabase Webhooks present in `Authorization: Bearer …` to /api/revalidate. */
  REVALIDATE_SECRET: required("REVALIDATE_SECRET"),
  /** HMAC signing key for the /admin/* session cookie. Rotating invalidates all sessions. */
  ADMIN_SECRET: required("ADMIN_SECRET"),
  /** Owner login password. Compared via crypto.timingSafeEqual on POST /admin/login. */
  ADMIN_PASSWORD: required("ADMIN_PASSWORD"),
};
