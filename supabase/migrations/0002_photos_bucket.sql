-- Supabase Storage `photos` bucket.
--
-- Hand-written per A7 (Drizzle Kit doesn't manage Supabase Storage). Created
-- as a SQL migration (not a Studio click) so any environment that runs
-- `pnpm db:migrate` from scratch ends up with the same bucket configuration.
--
-- Posture (per STACK-PIVOT.md F2 + the photos-bucket decision in phase 5 plan):
--   • PUBLIC bucket — anyone can fetch object URLs directly. The
--     ResponsiveImage component constructs URLs as
--     `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/<path>`
--     with no auth round-trip. Faster renders for the parent-in-parking-lot
--     P0 use case; no per-photo access control needed for a public directory.
--   • Uploads happen only via the `service_role` key (SUPABASE_SECRET_KEY)
--     from `scripts/migrate-wp.ts` and future Studio drag-drops; that key
--     bypasses RLS, so no INSERT policy needed.
--   • File size cap: 10MB. Post-Sharp WebP files will be <500KB; the cap is
--     defense-in-depth against accidental full-resolution originals.
--   • Allowed MIME types: webp/jpeg/png. Migration emits JPEG (mozJPEG-encoded)
--     per the F2 amendment in phase 5; webp/png stay allowed so the owner can
--     drag-drop unprocessed photos into Studio post-launch without us erroring
--     (we'll Sharp-process those server-side in a later phase if it becomes
--     a workflow).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  TRUE,
  10485760,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;
