-- Phase 9 — REPLICA IDENTITY FULL on every table the webhook resolver touches.
--
-- Supabase Database Webhooks fire from logical replication. On UPDATE and DELETE
-- the webhook payload includes `old_record`, but Postgres only populates
-- old_record with whatever columns the table's REPLICA IDENTITY exposes.
-- DEFAULT (the Postgres default) exposes only the PK columns. FULL exposes the
-- entire row.
--
-- STACK-PIVOT.md's pre-launch checklist named only `parks` + `park_obstacles`
-- because their PKs already include the columns the resolver needs (parks.id
-- + park_obstacles.park_id+obstacle). But three child tables have serial `id`
-- PKs that do NOT include park_id:
--   - park_renovations  (PK: id)
--   - park_links        (PK: id)
--   - park_photos       (PK: id)
-- A DELETE webhook on any of these would arrive with old_record = {id: N},
-- and the resolver could not find the parent park's slug to revalidate
-- /park/<slug> or the cascading /county/<X> + /obstacle/<Y> archives.
--
-- Locked decision 1A (plan-eng-review 2026-06-13): FULL on all 8 tables.
-- The slightly larger WAL write per change is negligible at Hobby write
-- volume (~5-50 writes/day during normal owner editing), and the future-
-- proofing protects against any new resolver fan-out we add later.
--
-- ALTER TABLE ... REPLICA IDENTITY is idempotent — re-running this migration
-- is a no-op.

ALTER TABLE "parks" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_obstacles" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_amenities" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_riding_surfaces" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_builders" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_renovations" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_links" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "park_photos" REPLICA IDENTITY FULL;
