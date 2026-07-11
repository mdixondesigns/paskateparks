-- Phase 9 follow-up — close the Supabase "Table publicly accessible" alert
-- dated 2026-06-08. The 11 application tables already had RLS on (see
-- 0001_rls.sql). The miss was `__paskateparks_migrations`, the migration
-- tracking table that scripts/db-migrate.ts creates inline via
-- `CREATE TABLE IF NOT EXISTS` outside any .sql migration, so it never went
-- through the 0001_rls.sql pass.
--
-- The tracking table holds only (filename, applied_at) — no app data — but
-- a leaked publishable key would reveal migration history (file names +
-- timestamps), useful reconnaissance for an attacker. Deny-all-anon brings
-- it in line with every other public-schema table.
--
-- The scripts/db-migrate.ts CREATE TABLE statement is also updated in this
-- commit to ENABLE ROW LEVEL SECURITY at create time, so a fresh DB bootstrap
-- (no existing tracking table) goes straight to the secure state without
-- needing this migration to apply.

-- Conditional (2026-07-07, user-accounts v1): on a FRESH database (e.g.
-- `supabase start` for the local test stack) this table doesn't exist yet —
-- scripts/db-migrate.ts creates it later, WITH RLS at create time (see
-- comment above). Skipping when absent is therefore safe everywhere:
-- production had the table when this migration originally ran; fresh DBs
-- get RLS from the bootstrap path.
DO $$
BEGIN
  IF to_regclass('public.__paskateparks_migrations') IS NOT NULL THEN
    ALTER TABLE "__paskateparks_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- No policies: anon role has zero access; service_role bypasses RLS. Matches
-- the posture documented in 0001_rls.sql.
