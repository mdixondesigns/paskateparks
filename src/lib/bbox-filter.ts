// Restored 2026-07-06 (originally T4, 2026-06-22 plan) — pure functions for
// bbox-driven list filtering. Composed by SyncedMapList; HomeParkList stays
// unaware of map state.
//
// We accept a structural bounds-like shape rather than importing Leaflet's
// L.LatLngBounds type — keeps this file pure-data and lets the wrapper pass
// either a real Leaflet bounds or a literal {south, west, north, east}
// envelope (used in unit tests).

export interface LatLngBoundsLike {
  /** Minimum latitude (southernmost). */
  south: number;
  /** Minimum longitude (westernmost). */
  west: number;
  /** Maximum latitude (northernmost). */
  north: number;
  /** Maximum longitude (easternmost). */
  east: number;
}

/**
 * True if the park's coords fall inside the bounds (inclusive of edges,
 * matches Leaflet's LatLngBounds.contains default). Returns false for
 * null lat/lng AND for NaN/Infinity bounds (defensive — a bad bounds
 * passed in must not silently include everything).
 */
export function inBbox(
  park: { lat: number | null; lng: number | null },
  bounds: LatLngBoundsLike,
): boolean {
  if (park.lat === null || park.lng === null) return false;
  if (!Number.isFinite(park.lat) || !Number.isFinite(park.lng)) return false;
  if (
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.east)
  ) {
    return false;
  }
  return (
    park.lat >= bounds.south &&
    park.lat <= bounds.north &&
    park.lng >= bounds.west &&
    park.lng <= bounds.east
  );
}

/**
 * Returns the subset of parks within the bounds. Preserves input order
 * (callers can sort upstream/downstream). Empty result for empty input
 * OR all-outside is a normal, valid outcome (the SyncedMapList wrapper
 * renders an empty-state copy in that case).
 */
export function filterByBbox<T extends { lat: number | null; lng: number | null }>(
  parks: readonly T[],
  bounds: LatLngBoundsLike,
): T[] {
  return parks.filter((p) => inBbox(p, bounds));
}
