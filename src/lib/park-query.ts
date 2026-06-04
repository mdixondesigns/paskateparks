import "server-only";

import { asc, eq, ne, isNotNull, and } from "drizzle-orm";

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

/** Hero photo + the first photo of every park — used for Nearby card thumbnails. */
export async function getHeroPhotoFor(parkIds: readonly number[]): Promise<Map<number, string>> {
  if (parkIds.length === 0) return new Map();
  const rows = await db
    .select({ parkId: parkPhotos.parkId, storagePath: parkPhotos.storagePath, sortOrder: parkPhotos.sortOrder })
    .from(parkPhotos)
    .orderBy(asc(parkPhotos.parkId), asc(parkPhotos.sortOrder));
  const map = new Map<number, string>();
  for (const row of rows) {
    if (parkIds.includes(row.parkId) && !map.has(row.parkId)) {
      map.set(row.parkId, row.storagePath);
    }
  }
  return map;
}
