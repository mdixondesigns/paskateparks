-- Row Level Security policies.
-- Hand-written per A7 (plan-eng-review 2026-06-03): Drizzle Kit generates schema,
-- Supabase CLI applies; RLS is one of the things Drizzle Kit doesn't emit.
--
-- Posture (per STACK-PIVOT.md, refined by A8 trim):
--   • Every public-schema table has RLS enabled — defense-in-depth so any future
--     anon-key client read fails instead of leaking data.
--   • No anon-facing policies anywhere. anon role has zero access by default.
--   • service_role bypasses RLS automatically — used by Drizzle clients at
--     build-time (RSC) and in serverless API routes via SUPABASE_SERVICE_ROLE_KEY.
--   • Suggestions WITH CHECK on park_id existence (per STACK-PIVOT.md finding #15)
--     is enforced by the FOREIGN KEY constraint on suggestions.park_id → parks.id
--     that Drizzle generated — same guarantee, simpler.

ALTER TABLE "parks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_renovations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_riding_surfaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_obstacles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_amenities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "builders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "park_builders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY statements: anon has zero access; service_role bypasses RLS.
-- The Supabase dashboard will flag "RLS enabled with no policies" — that is
-- intentional. Re-enable when a feature needs anon read (none planned for v1).
