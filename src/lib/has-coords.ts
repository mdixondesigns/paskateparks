/**
 * Generic coord-predicate. Lives in its own module so client components
 * (SyncedMapList) can import without pulling `server-only` park-query.ts
 * (which imports postgres) into the browser bundle.
 *
 * Generic over the input shape so the narrowing preserves extra fields
 * like heroPhotoPath and alias — used by both:
 *   • getOpenParksForMap (MapParkRow) — narrows from getAllParksForNearby
 *   • SyncedMapList client wrapper — narrows HomeParkRow client-side
 *
 * Phase 7 ship-review adversarial fix (A3) — besides the null check that
 * the type system requires, also reject NaN/Infinity/out-of-bounds values
 * the same way findNearby() does in src/lib/nearby.ts. db:check-coords
 * gates against bad values at write; this is defense-in-depth at read.
 */
export function hasCoords<T extends { lat: number | null; lng: number | null }>(
  p: T,
): p is T & { lat: number; lng: number } {
  if (p.lat === null || p.lng === null) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) return false;
  return true;
}
