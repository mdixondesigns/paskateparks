/**
 * Inserter — writes transformed payloads into Postgres.
 *
 * Design rules:
 *   1. Idempotent. Every entity has a `wp_post_id` UNIQUE column; we
 *      `ON CONFLICT (wp_post_id) DO UPDATE` so re-runs upsert cleanly without
 *      duplicating.
 *   2. Per-park transaction. We DELETE all child rows for a park's
 *      `wp_post_id` and re-INSERT from the fresh payload. Avoids the "what
 *      if a row got removed from the payload" drift problem.
 *   3. Inserter resolves IDs. The transform layer emits `builderNames: ["DIY"]`;
 *      we look up the inserted builder row to find its id and write the
 *      `park_builders` join row. Pre-builds a Map<name, id> so the lookup is
 *      O(1) per park.
 *   4. D29 alt-text fallback. If `photo.altText` is null, generate
 *      `"<Park name> photo <N>"` per the schema doc. Owner backfills via Studio.
 *
 * Each function takes a Drizzle client + the payload(s). The orchestrator
 * (scripts/migrate-wp.ts) constructs the client and passes it down — this
 * module never opens its own connection so it composes cleanly with tests.
 */

import { eq, inArray } from "drizzle-orm";
import { sql as sqlTag } from "drizzle-orm";

import * as schema from "../../src/db/schema";

import { storagePathForPhoto } from "./photos";
import type { BuilderPayload, ParkPayload, ShopPayload } from "./types";

// Loose Drizzle DB type — the orchestrator passes its constructed client.
// Using `any` here is intentional: the alternative (re-exporting the precise
// PostgresJsDatabase<typeof schema> generic) would couple this file to the
// postgres-js driver name, and the call sites are already typed via the imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleDB = any;

// ─── Builders ────────────────────────────────────────────────────────────────

export interface InsertBuildersResult {
  total: number;
  /** name → id, for park inserter to consume when wiring park_builders. */
  byName: Map<string, number>;
}

export async function insertBuilders(
  db: DrizzleDB,
  payloads: BuilderPayload[],
): Promise<InsertBuildersResult> {
  const byName = new Map<string, number>();

  // Conflict target = `name`, not `wp_post_id`. Per STACK-PIVOT.md design
  // intent, `builders.name` is the natural dedup key ("Prevents duplicate
  // 'DIY' silent inserts" — the doc spells this out). Targeting wp_post_id
  // misses the case where a builder row already exists with name="DIY" and
  // wp_post_id=NULL (e.g., from the phase 3 seed) — the migration's later
  // attempt to insert a fresh "DIY" with wp_post_id=63 would fire the
  // name UNIQUE constraint before the wp_post_id conflict ever resolves.
  for (const b of payloads) {
    const [row] = await db
      .insert(schema.builders)
      .values({
        wpPostId: b.wpPostId,
        name: b.name.trim(),
        url: b.url,
        logoPath: null,
      })
      .onConflictDoUpdate({
        target: schema.builders.name,
        set: {
          wpPostId: b.wpPostId,
          url: b.url,
        },
      })
      .returning({ id: schema.builders.id, name: schema.builders.name });
    if (row) byName.set(row.name, row.id);
  }

  return { total: payloads.length, byName };
}

// ─── Shops ───────────────────────────────────────────────────────────────────

export interface InsertShopsResult {
  total: number;
  skipped: number;
}

export async function insertShops(
  db: DrizzleDB,
  payloads: ShopPayload[],
): Promise<InsertShopsResult> {
  let skipped = 0;

  for (const s of payloads) {
    // `shops.lat` and `lng` are NOT NULL in our schema (per STACK-PIVOT.md —
    // shops are always geo-located so Nearby Shops can compute). If we got a
    // shop without coords, log + skip rather than crash the whole migration.
    if (s.lat == null || s.lng == null) {
      console.warn(`[insert] shop ${JSON.stringify(s.name)} has no lat/lng — skipping`);
      skipped++;
      continue;
    }
    await db
      .insert(schema.shops)
      .values({
        wpPostId: s.wpPostId,
        name: s.name,
        url: s.url,
        logoPath: null,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        state: s.state,
      })
      .onConflictDoUpdate({
        target: schema.shops.wpPostId,
        set: {
          name: s.name,
          url: s.url,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          state: s.state,
        },
      });
  }

  return { total: payloads.length - skipped, skipped };
}

// ─── Parks ───────────────────────────────────────────────────────────────────

export interface InsertParkResult {
  parkId: number;
  childRowsInserted: number;
}

/**
 * Insert one park + all its children in a single transaction. Idempotent —
 * delete-then-insert pattern for children means re-running with a changed
 * payload converges to that payload's state.
 *
 * `buildersByName` is the map returned by `insertBuilders` — used to wire
 * the park_builders join.
 */
export async function insertOnePark(
  db: DrizzleDB,
  payload: ParkPayload,
  buildersByName: Map<string, number>,
): Promise<InsertParkResult> {
  return db.transaction(async (tx: DrizzleDB) => {
    // 1) Upsert the parent park row (by wp_post_id)
    const [parkRow] = await tx
      .insert(schema.parks)
      .values({
        wpPostId: payload.wpPostId,
        slug: payload.slug,
        name: payload.name,
        status: payload.status,
        city: payload.city,
        state: payload.state,
        establishedYear: payload.establishedYear,
        parkType: payload.parkType,
        squareFootage: payload.squareFootage,
        county: payload.county,
        streetAddress: payload.streetAddress,
        zip: payload.zip,
        lat: payload.lat,
        lng: payload.lng,
        hours: payload.hours,
        description: payload.description,
        allowsSkateboards: payload.allowsSkateboards,
        allowsBikes: payload.allowsBikes,
        allowsRollerSkates: payload.allowsRollerSkates,
        allowsScooters: payload.allowsScooters,
        vehicleRulesNotes: payload.vehicleRulesNotes,
        helmets: payload.helmets,
        otherPadsRequired: payload.otherPadsRequired,
        fee: payload.fee,
        programming: payload.programming,
        ridingSurfaceNotes: payload.ridingSurfaceNotes,
      })
      .onConflictDoUpdate({
        target: schema.parks.wpPostId,
        set: {
          slug: payload.slug,
          name: payload.name,
          status: payload.status,
          city: payload.city,
          state: payload.state,
          establishedYear: payload.establishedYear,
          parkType: payload.parkType,
          squareFootage: payload.squareFootage,
          county: payload.county,
          streetAddress: payload.streetAddress,
          zip: payload.zip,
          lat: payload.lat,
          lng: payload.lng,
          hours: payload.hours,
          description: payload.description,
          allowsSkateboards: payload.allowsSkateboards,
          allowsBikes: payload.allowsBikes,
          allowsRollerSkates: payload.allowsRollerSkates,
          allowsScooters: payload.allowsScooters,
          vehicleRulesNotes: payload.vehicleRulesNotes,
          helmets: payload.helmets,
          otherPadsRequired: payload.otherPadsRequired,
          fee: payload.fee,
          programming: payload.programming,
          ridingSurfaceNotes: payload.ridingSurfaceNotes,
          updatedAt: sqlTag`now()`,
        },
      })
      .returning({ id: schema.parks.id });

    if (!parkRow) throw new Error(`insertOnePark: upsert returned no row for ${payload.slug}`);
    const parkId = parkRow.id;
    let childCount = 0;

    // 2) Delete all existing children for this park (idempotency per finding #9)
    await tx.delete(schema.parkRenovations).where(eq(schema.parkRenovations.parkId, parkId));
    await tx.delete(schema.parkRidingSurfaces).where(eq(schema.parkRidingSurfaces.parkId, parkId));
    await tx.delete(schema.parkObstacles).where(eq(schema.parkObstacles.parkId, parkId));
    await tx.delete(schema.parkAmenities).where(eq(schema.parkAmenities.parkId, parkId));
    await tx.delete(schema.parkLinks).where(eq(schema.parkLinks.parkId, parkId));
    await tx.delete(schema.parkPhotos).where(eq(schema.parkPhotos.parkId, parkId));
    await tx.delete(schema.parkBuilders).where(eq(schema.parkBuilders.parkId, parkId));

    // 3) Insert fresh children

    if (payload.renovations.length > 0) {
      await tx.insert(schema.parkRenovations).values(
        payload.renovations.map((r) => ({
          parkId,
          year: r.year,
          notes: r.notes,
          sortOrder: r.sortOrder,
        })),
      );
      childCount += payload.renovations.length;
    }

    if (payload.ridingSurfaces.length > 0) {
      await tx.insert(schema.parkRidingSurfaces).values(
        payload.ridingSurfaces.map((s) => ({ parkId, surface: s })),
      );
      childCount += payload.ridingSurfaces.length;
    }

    if (payload.obstacles.length > 0) {
      await tx.insert(schema.parkObstacles).values(
        payload.obstacles.map((o) => ({ parkId, obstacle: o })),
      );
      childCount += payload.obstacles.length;
    }

    if (payload.amenities.length > 0) {
      await tx.insert(schema.parkAmenities).values(
        payload.amenities.map((a) => ({
          parkId,
          type: a.type,
          present: a.present,
          notes: a.notes,
          // Amenity photos: WP doesn't have them per the audit; deferred for now.
          photoPath: null,
        })),
      );
      childCount += payload.amenities.length;
    }

    if (payload.links.length > 0) {
      await tx.insert(schema.parkLinks).values(
        payload.links.map((l) => ({
          parkId,
          type: l.type,
          url: l.url,
          label: l.label,
          sortOrder: l.sortOrder,
        })),
      );
      childCount += payload.links.length;
    }

    if (payload.photos.length > 0) {
      await tx.insert(schema.parkPhotos).values(
        payload.photos.map((p) => ({
          parkId,
          storagePath: storagePathForPhoto(payload.slug, p.sortOrder),
          credit: null,
          caption: null,
          // D29 alt-text fallback: park name + 1-indexed position
          altText: p.altText ?? `${payload.name} photo ${p.sortOrder + 1}`,
          sortOrder: p.sortOrder,
        })),
      );
      childCount += payload.photos.length;
    }

    if (payload.builderNames.length > 0) {
      const builderRows = payload.builderNames
        .map((name, idx) => {
          const builderId = buildersByName.get(name);
          if (builderId == null) {
            console.warn(
              `[insert] park ${payload.slug}: builder name ${JSON.stringify(name)} not found in inserted builders map — skipping`,
            );
            return null;
          }
          return { parkId, builderId, sortOrder: idx };
        })
        .filter((r): r is NonNullable<typeof r> => r != null);
      if (builderRows.length > 0) {
        await tx.insert(schema.parkBuilders).values(builderRows);
        childCount += builderRows.length;
      }
    }

    return { parkId, childRowsInserted: childCount };
  });
}

// ─── Verification helper ─────────────────────────────────────────────────────

/** Quick post-migration sanity check: counts rows per table for visibility. */
export async function countAllTables(db: DrizzleDB): Promise<Record<string, number>> {
  const tables = [
    "parks", "park_renovations", "park_riding_surfaces", "park_obstacles",
    "park_amenities", "park_links", "park_photos", "park_builders",
    "builders", "shops",
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const result = await db.execute(sqlTag.raw(`SELECT count(*)::int AS n FROM ${t}`));
    // postgres-js returns an array of rows; first row's `n` is the count.
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    const first = rows[0] as { n?: number } | undefined;
    counts[t] = first?.n ?? 0;
  }
  return counts;
}

// Re-export inArray for orchestrator use (e.g., bulk delete on dry-run cleanup)
export { inArray };
