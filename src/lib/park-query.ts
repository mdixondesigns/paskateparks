import "server-only";

import { asc, eq, ne, isNotNull, and, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  builders,
  parkAmenities,
  parkBuilders,
  parkLinks,
  parkObstacles,
  parkPhotos,
  parkRenovations,
  parkRidingSurfaces,
  parks,
  shops,
} from "@/db/schema";

/**
 * Fetch a park by slug along with every child relation needed by the
 * 16-section profile template. Returns null if no park matches.
 *
 * Uses 7 parallel queries via Promise.all rather than one giant JOIN — Drizzle's
 * relational query API would be cleaner here, but the explicit form is easier
 * to reason about and the cost is one extra round-trip per page build, on a
 * route that's statically generated.
 */
export async function getParkBySlug(slug: string) {
  const [park] = await db.select().from(parks).where(eq(parks.slug, slug)).limit(1);
  if (!park) return null;

  const [
    renovations,
    surfaceRows,
    obstacleRows,
    amenities,
    links,
    photos,
    builderJoins,
  ] = await Promise.all([
    db
      .select()
      .from(parkRenovations)
      .where(eq(parkRenovations.parkId, park.id))
      .orderBy(asc(parkRenovations.sortOrder), asc(parkRenovations.year)),
    db
      .select()
      .from(parkRidingSurfaces)
      .where(eq(parkRidingSurfaces.parkId, park.id)),
    db.select().from(parkObstacles).where(eq(parkObstacles.parkId, park.id)),
    db.select().from(parkAmenities).where(eq(parkAmenities.parkId, park.id)),
    db
      .select()
      .from(parkLinks)
      .where(eq(parkLinks.parkId, park.id))
      .orderBy(asc(parkLinks.sortOrder)),
    db
      .select()
      .from(parkPhotos)
      .where(eq(parkPhotos.parkId, park.id))
      .orderBy(asc(parkPhotos.sortOrder)),
    db
      .select({ builder: builders, sortOrder: parkBuilders.sortOrder })
      .from(parkBuilders)
      .innerJoin(builders, eq(builders.id, parkBuilders.builderId))
      .where(eq(parkBuilders.parkId, park.id))
      .orderBy(asc(parkBuilders.sortOrder)),
  ]);

  return {
    ...park,
    renovations,
    surfaces: surfaceRows.map((s) => s.surface),
    obstacles: obstacleRows.map((o) => o.obstacle),
    amenities,
    links,
    photos,
    builders: builderJoins.map((j) => j.builder),
  };
}

export type ParkWithRelations = NonNullable<Awaited<ReturnType<typeof getParkBySlug>>>;

/** All parks with non-null coords — feed for Nearby Parks at build time. */
export async function getAllParksForNearby(excludeParkId?: number) {
  const rows = await db
    .select({
      id: parks.id,
      slug: parks.slug,
      name: parks.name,
      city: parks.city,
      state: parks.state,
      lat: parks.lat,
      lng: parks.lng,
    })
    .from(parks)
    .where(
      and(
        isNotNull(parks.lat),
        isNotNull(parks.lng),
        excludeParkId != null ? ne(parks.id, excludeParkId) : undefined,
      ),
    );
  return rows;
}

/** All shops with non-null coords — feed for Nearby Shops at build time. */
export async function getAllShopsForNearby() {
  return db
    .select({
      id: shops.id,
      name: shops.name,
      url: shops.url,
      address: shops.address,
      state: shops.state,
      lat: shops.lat,
      lng: shops.lng,
    })
    .from(shops);
}

/**
 * Hero photo (sort_order = lowest) per park, for the requested park ids.
 * Used as the thumbnail on NearbyCard rows on both /park/<slug> and / .
 *
 * Indexed only on the rows we asked for via WHERE inArray — earlier versions
 * SELECT'd every park_photos row and filtered in Node with includes(), which
 * was O(n*m). The homepage now passes every park id, so the WHERE keeps it
 * O(rows-returned).
 */
export async function getHeroPhotoFor(parkIds: readonly number[]): Promise<Map<number, string>> {
  if (parkIds.length === 0) return new Map();
  const rows = await db
    .select({ parkId: parkPhotos.parkId, storagePath: parkPhotos.storagePath })
    .from(parkPhotos)
    .where(inArray(parkPhotos.parkId, [...parkIds]))
    .orderBy(asc(parkPhotos.parkId), asc(parkPhotos.sortOrder));
  const map = new Map<number, string>();
  for (const row of rows) {
    if (!map.has(row.parkId)) {
      map.set(row.parkId, row.storagePath);
    }
  }
  return map;
}

/**
 * Homepage row — what the / list-first view (phase 6, D6) needs to render a
 * card without re-fetching on the client. Sorted alphabetically by name; client
 * island re-sorts by Haversine distance once the user grants geolocation.
 *
 *   ┌─ getAllParksForHomepage ─────────────────────────────────────┐
 *   │                                                              │
 *   │   parks ─────────────┐                                       │
 *   │     (alpha by name)  │                                       │
 *   │                      ▼                                       │
 *   │   getHeroPhotoFor(ids) ──► Map<parkId,storagePath>           │
 *   │                      │                                       │
 *   │                      ▼                                       │
 *   │   HomeParkRow[] ── serialized as <HomeParkList> prop         │
 *   │                                                              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Build-time only. Phase 9 webhook revalidation rebuilds when the parks table
 * changes. Parks with NULL lat/lng are included (filter-only fallback still
 * works) but get excluded from distance sort on the client (per nearby.ts).
 */
export interface HomeParkRow {
  id: number;
  slug: string;
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  heroPhotoPath: string | null;
}

// Soft tripwire — TODOS.md P2 ("Homepage scaling breakpoint"). At ~7KB/park
// client serialization, 200 rows = ~1.4MB above-the-fold which starts hurting
// cold LCP. Warn loudly at build so we don't ship past the line silently.
const HOMEPAGE_SCALE_WARN_THRESHOLD = 200;

export async function getAllParksForHomepage(): Promise<HomeParkRow[]> {
  // Exclude temporarily_closed + permanently_closed parks from the homepage —
  // a parent in a parking lot ranking a closed park as "nearest" is exactly
  // the P0 trust failure D11 was meant to prevent. Closed park profile pages
  // still render at /park/<slug> as historical record; they're just not
  // promoted on discovery surfaces. When `status` flips back to 'open' the
  // phase 9 webhook revalidates this route and the park reappears.
  const rows = await db
    .select({
      id: parks.id,
      slug: parks.slug,
      name: parks.name,
      city: parks.city,
      state: parks.state,
      lat: parks.lat,
      lng: parks.lng,
    })
    .from(parks)
    .where(eq(parks.status, "open"))
    .orderBy(asc(parks.name));

  if (rows.length > HOMEPAGE_SCALE_WARN_THRESHOLD) {
    console.warn(
      `[getAllParksForHomepage] ${rows.length} parks exceeds ${HOMEPAGE_SCALE_WARN_THRESHOLD}-row threshold — ` +
        `client-serialize+sort model starts hurting cold LCP. See TODOS.md "Homepage scaling breakpoint".`,
    );
  }

  const heroPhotos = await getHeroPhotoFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, heroPhotoPath: heroPhotos.get(r.id) ?? null }));
}
