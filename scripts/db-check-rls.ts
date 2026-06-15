/**
 * Live audit of Row Level Security across every public-schema table.
 *
 * Run:
 *   pnpm db:check-rls
 *
 * Prints a table of (tablename, rls_enabled, policy_count) and exits non-zero
 * if any public-schema table has RLS off. Used to (a) close out the
 * 2026-06-08 Supabase critical email and (b) catch regressions where a new
 * table lands without the 0001_rls.sql / 0005_enable_rls_tracking.sql treatment.
 *
 * Why this and not Supabase's own advisor? Their lint runs on their cadence
 * (~weekly email). This is on-demand and exits non-zero so CI / pre-deploy
 * scripts can gate on it.
 *
 * Policy count is informational — we ship a deny-all-anon posture (RLS on,
 * zero policies) per 0001_rls.sql. A non-zero policy count means someone
 * intentionally added one for client-side reads, which is fine — just review.
 */

import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: ".env.local" });

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("Missing DIRECT_URL in .env.local — see scripts/db-migrate.ts header for setup.");
  process.exit(1);
}

const sql = postgres(DIRECT_URL, { prepare: false });

interface Row {
  tablename: string;
  rls_enabled: boolean;
  policy_count: number;
}

async function main() {
  const rows = await sql<Row[]>`
    SELECT
      c.relname AS tablename,
      c.relrowsecurity AS rls_enabled,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `;

  console.table(rows);

  const offending = rows.filter((r) => !r.rls_enabled);
  if (offending.length > 0) {
    console.error(
      `\n✗ ${offending.length} table(s) without RLS enabled: ${offending
        .map((r) => r.tablename)
        .join(", ")}`,
    );
    console.error(
      "  Fix by adding `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` to a new\n" +
        "  migration in supabase/migrations/ and running `pnpm db:migrate`.",
    );
    await sql.end();
    process.exit(1);
  }

  console.log(`\n✓ All ${rows.length} public-schema tables have RLS enabled.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
