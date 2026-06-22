// T4 — Pure functions for bbox-driven list filtering.
//
// Composed by SyncedMapList; HomeParkList stays unaware of map state.
// Filter pipeline order is: bbox → freetext → distance-sort (E3, D5).
//
// Why pure functions in src/lib/ instead of inside HomeParkList:
//   1. Reusable from SyncedMapList wrapper without coupling list to Leaflet
//   2. Unit-testable without React or DOM
//   3. /county/[slug] + /obstacle/[slug] taxonomy archives can reuse the
//      same primitives when the deferred <DirectoryShell> migration lands
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

/**
 * True when the new bounds are materially different from the previous —
 * used to decide whether "Search this area" should reappear after a pan
 * or zoom. We compare BOUNDS, not center distance (codex catch — viewport
 * resize changes bounds without moving center). 1% tolerance per edge
 * absorbs tiny drifts from imprecise pointer events and aspect-ratio
 * shimmer without false-triggering the button.
 */
export function boundsChanged(
  prev: LatLngBoundsLike | null,
  curr: LatLngBoundsLike,
  tolerancePct = 0.01,
): boolean {
  if (prev === null) return true;
  const latSpan = Math.abs(curr.north - curr.south);
  const lngSpan = Math.abs(curr.east - curr.west);
  const latTol = latSpan * tolerancePct;
  const lngTol = lngSpan * tolerancePct;
  return (
    Math.abs(prev.south - curr.south) > latTol ||
    Math.abs(prev.north - curr.north) > latTol ||
    Math.abs(prev.west - curr.west) > lngTol ||
    Math.abs(prev.east - curr.east) > lngTol
  );
}
