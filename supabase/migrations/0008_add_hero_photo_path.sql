-- Add parks.hero_photo_path — an optional purpose-shot panorama for the hero
-- band, distinct from the gallery.
--
-- Today the hero, the gallery's lead tile, the map marker, and the map popup
-- all render the same image (the first park_photos row by sort_order). This
-- column lets the hero diverge: HeroBlock uses hero_photo_path when set and
-- falls back to the first gallery photo when null, so the gallery lead stays
-- the map thumbnail exactly as before.
--
-- Nullable on purpose: every park ships null (fallback = current behavior) until
-- panoramas are captured and loaded. Populated per-park via seed/SQL for now;
-- wire it into the photo-upload admin UI when that's built (see TODOS.md).
-- Mirrors parks.riding_surface_photo_path.

ALTER TABLE parks ADD COLUMN hero_photo_path text;
