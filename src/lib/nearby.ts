// Haversine distance + nearby helpers.
// Used at build time by /park/[slug]/page.tsx to compute Nearby Parks (D24) and
// Nearby Shops (D5/D7) — top-K within radius, no state border rule for shops.

const EARTH_RADIUS_MILES = 3958.8;

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aHav =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aHav), Math.sqrt(1 - aHav));
  return EARTH_RADIUS_MILES * c;
}

export interface WithCoords {
  lat: number | null;
  lng: number | null;
}

/**
 * Find the top-K nearest items within `maxMiles` of an origin.
 * Items with NULL lat/lng are excluded silently (per STACK-PIVOT.md finding #2 —
 * 99 stub parks don't have coords yet).
 * Returns items with a `distanceMiles` field appended, sorted nearest-first.
 */
export function findNearby<T extends WithCoords>(
  origin: LatLng,
  candidates: readonly T[],
  options: { limit: number; maxMiles: number; excludeId?: number },
): (T & { distanceMiles: number })[] {
  const results: (T & { distanceMiles: number })[] = [];
  for (const c of candidates) {
    if (c.lat == null || c.lng == null) continue;
    if (
      "id" in c &&
      typeof c.id === "number" &&
      options.excludeId != null &&
      c.id === options.excludeId
    ) {
      continue;
    }
    const distanceMiles = haversineMiles(origin, { lat: c.lat, lng: c.lng });
    if (distanceMiles > options.maxMiles) continue;
    results.push({ ...c, distanceMiles });
  }
  results.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return results.slice(0, options.limit);
}
