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
  type obstacleType,
} from "@/db/schema";

type ObstacleType = (typeof obstacleType.enumValues)[number];

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

/**
 * All OPEN parks with non-null coords — feed for Nearby Parks at build time
 * AND the /map/ pin set (via the getOpenParksForMap wrapper below).
 *
 * D11 consistency fix (phase 7, plan-eng-review 1C): the WHERE status='open'
 * predicate matches the homepage's getAllParksForHomepage. A parent reading
 * a park profile must not be recommended a closed park as "nearby" — same
 * trust failure adversarial review caught for / in phase 6, latent on every
 * park profile since phase 4. Closed park profiles still render at
 * /park/<slug> as historical record per D11; they just don't appear on
 * other parks' discovery surfaces.
 */
export async function getAllParksForNearby(excludeParkId?: number) {
  // Alpha order at the source so the /map/ sr-only fallback list (and any
  // other future caller that doesn't re-sort) matches the homepage's D1
  // alpha order. findNearby() ignores this order — it sorts by Haversine
  // distance — so per-park Nearby Parks is unaffected. Phase 7 ship-review
  // adversarial fix (A2): without this, the /map/ fallback list shipped in
  // DB physical order, regressing from the homepage's alpha contract.
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
        eq(parks.status, "open"),
        isNotNull(parks.lat),
        isNotNull(parks.lng),
        excludeParkId != null ? ne(parks.id, excludeParkId) : undefined,
      ),
    )
    .orderBy(asc(parks.name));
  return rows;
}

/**
 * Same data as getAllParksForNearby, but with lat/lng type-narrowed to
 * non-nullable. Phase 7 plan-eng-review CMT-2: Drizzle's inferred type sees
 * `lat: number | null` even after the runtime isNotNull filter — the map code
 * shouldn't have to non-null-assert. This wrapper carries the runtime narrowing
 * into the type system via a type predicate, with the single source of truth
 * for the OPEN+coords WHERE staying in getAllParksForNearby above.
 */
export interface MapParkRow {
  id: number;
  slug: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  /** Hero photo (sort_order=0) for thumbnail markers + popups. null = stub
   *  park with no photos → MapView renders a plain pin instead. */
  heroPhotoPath: string | null;
}

/**
 * Type predicate for the getOpenParksForMap wrapper. Exported for unit
 * testing the type-narrowing logic without standing up a Postgres connection.
 *
 * Phase 7 ship-review adversarial fix (A3): besides the null check that the
 * type system requires, also reject NaN / Infinity / out-of-bounds values
 * the same way findNearby() does in src/lib/nearby.ts. db:check-coords gates
 * against bad values landing in production, but defense-in-depth: a CMS
 * typo (lat=999) would otherwise poison L.marker + fitBounds on /map/ and
 * break the entire map for everyone.
 */
// hasCoords lives in src/lib/has-coords.ts so client components can import
// without pulling server-only park-query into the browser bundle. Re-exported
// from here for the existing call sites + test file.
import { hasCoords } from "./has-coords";
export { hasCoords };

export async function getOpenParksForMap(): Promise<MapParkRow[]> {
  const rows = await getAllParksForNearby();
  const withCoords = rows.filter(hasCoords);
  if (withCoords.length === 0) return [];

  // Batched hero-photo lookup: one query for the sort_order=0 row of every
  // park on the map. Merged in JS to keep getAllParksForNearby lean for its
  // other consumer (per-park Nearby Parks sidebar, which doesn't need photos).
  const ids = withCoords.map((p) => p.id);
  const heroRows = await db
    .select({ parkId: parkPhotos.parkId, storagePath: parkPhotos.storagePath })
    .from(parkPhotos)
    .where(and(eq(parkPhotos.sortOrder, 0), inArray(parkPhotos.parkId, ids)));
  const heroByParkId = new Map(heroRows.map((r) => [r.parkId, r.storagePath]));

  return withCoords.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    city: p.city,
    state: p.state,
    lat: p.lat,
    lng: p.lng,
    heroPhotoPath: heroByParkId.get(p.id) ?? null,
  }));
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
  alias: string | null;
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
      alias: parks.alias,
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

// ── Phase 8 — Taxonomy archives ─────────────────────────────────────────────

/**
 * Row shape served to /county/[slug] and /obstacle/[slug] page components.
 * Mirrors HomeParkRow minus the lat/lng — taxonomy archives don't sort by
 * distance, so coords are unnecessary client-side payload.
 */
export interface TaxonomyParkRow {
  id: number;
  slug: string;
  name: string;
  city: string;
  state: string;
  heroPhotoPath: string | null;
}

/**
 * All OPEN parks in a given county, alpha by name, with hero photo joined.
 *
 *   parks ──┬─ status='open'
 *           └─ county = displayName  (TEXT compare — case-sensitive against
 *                                     Studio data; assertCountiesInData runs
 *                                     at build time so drift can't sneak in)
 *
 * Caller passes the display-name form (e.g. "Bucks") — the route resolves
 * URL slug → County via counties.ts.countyForSlug.
 *
 * status='open' filter mirrors getAllParksForHomepage / getAllParksForNearby:
 * archives are discovery surfaces (D11), closed parks must not appear.
 *
 * Returns [] when no parks match — caller calls notFound() per locked phase
 * 8 D4 (empty taxonomy = 404).
 */
export async function getParksByCounty(displayName: string): Promise<TaxonomyParkRow[]> {
  const rows = await db
    .select({
      id: parks.id,
      slug: parks.slug,
      name: parks.name,
      city: parks.city,
      state: parks.state,
    })
    .from(parks)
    .where(and(eq(parks.status, "open"), eq(parks.county, displayName)))
    .orderBy(asc(parks.name));

  if (rows.length === 0) return [];

  const heroPhotos = await getHeroPhotoFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, heroPhotoPath: heroPhotos.get(r.id) ?? null }));
}

/**
 * All OPEN parks tagged with a given obstacle, alpha by name, hero photo joined.
 *
 *   park_obstacles (PK: park_id, obstacle)
 *        │  INNER JOIN on park_id
 *        ▼
 *   parks ── status='open'
 *
 * Caller passes the ObstacleType enum value — the route resolves URL slug
 * → enum via labels.ts.obstacleForSlug.
 *
 * Indexed by park_obstacles_obstacle_idx (phase 8 migration, CMT-6A) so
 * filter-by-obstacle stays fast as the obstacle row count grows past the
 * current ~150.
 */
export async function getParksByObstacle(
  obstacle: ObstacleType,
): Promise<TaxonomyParkRow[]> {
  const rows = await db
    .select({
      id: parks.id,
      slug: parks.slug,
      name: parks.name,
      city: parks.city,
      state: parks.state,
    })
    .from(parks)
    .innerJoin(parkObstacles, eq(parkObstacles.parkId, parks.id))
    .where(and(eq(parks.status, "open"), eq(parkObstacles.obstacle, obstacle)))
    .orderBy(asc(parks.name));

  if (rows.length === 0) return [];

  const heroPhotos = await getHeroPhotoFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, heroPhotoPath: heroPhotos.get(r.id) ?? null }));
}

/**
 * Distinct list of counties that currently have ≥1 open park. Feeds the
 * /county/[slug] generateStaticParams call so empty-taxonomy archives are
 * dropped from the static set (404 via dynamicParams=false).
 */
export async function getCountiesWithOpenParks(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ county: parks.county })
    .from(parks)
    .where(and(eq(parks.status, "open"), isNotNull(parks.county)))
    .orderBy(asc(parks.county));
  return rows.map((r) => r.county).filter((c): c is string => c != null);
}

/**
 * Distinct list of obstacles tagged on ≥1 open park. Feeds the
 * /obstacle/[slug] generateStaticParams call.
 */
export async function getObstaclesWithOpenParks(): Promise<ObstacleType[]> {
  const rows = await db
    .selectDistinct({ obstacle: parkObstacles.obstacle })
    .from(parkObstacles)
    .innerJoin(parks, eq(parks.id, parkObstacles.parkId))
    .where(eq(parks.status, "open"))
    .orderBy(asc(parkObstacles.obstacle));
  return rows.map((r) => r.obstacle);
}
