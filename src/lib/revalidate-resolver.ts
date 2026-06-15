import "server-only";

import { eq } from "drizzle-orm";

import { parkObstacles, parks, type obstacleType } from "@/db/schema";
import { slugForCounty } from "@/lib/counties";
import { obstacleSlug } from "@/lib/labels";

import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Drizzle client shape that the resolver accepts. Pooled (transaction-mode
// postgres-js) in production via /api/revalidate; can be a mock or a pglite
// instance in unit tests. Anything that exposes `select()` + `from()` + `where()`
// in Drizzle's standard relational shape works.
//
// Imported from both flavors so the test can use postgres-js for integration
// and pglite for offline unit tests without touching this signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolverDb = PostgresJsDatabase<any> | PgliteDatabase<any>;

type ObstacleType = (typeof obstacleType.enumValues)[number];

/**
 * Supabase Database Webhook envelope.
 *
 * The shape Supabase actually sends is captured to
 * e2e/fixtures/supabase-webhook-payload.json (T16) — that fixture is the source
 * of truth for tests. This type matches the documented public shape.
 *
 * `record` is populated on INSERT + UPDATE. `old_record` is populated on
 * UPDATE + DELETE and reflects whatever the table's REPLICA IDENTITY exposes.
 * Phase 9 migration 0004 sets FULL on every table the resolver touches, so
 * old_record always carries the full row.
 */
export interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
}

export interface ResolveResult {
  /** Distinct list of paths to revalidate. */
  paths: string[];
  /**
   * Park id whose `parks.last_revalidated_at` should be bumped (D18
   * observability). Null when the affected park has been deleted — there's
   * nothing left to update.
   */
  parkIdForTimestamp: number | null;
  /**
   * Human-readable warnings for structured logging. The route handler writes
   * these to stderr so Vercel logs surface drift (e.g. orphan county) without
   * blocking revalidation.
   */
  warnings: string[];
}

const KNOWN_TABLES = new Set([
  "parks",
  "park_obstacles",
  "park_photos",
  "park_amenities",
  "park_riding_surfaces",
  "park_builders",
  "park_renovations",
  "park_links",
]);

/**
 * Resolve a Supabase webhook payload into the set of static-generated paths
 * that need revalidation. Pure-ish: the only side effect is two SELECTs
 * against the parks/park_obstacles tables to look up slug + obstacle list.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Webhook payload (table + INSERT/UPDATE/DELETE + record)    │
 *   │                                                             │
 *   │  ┌─ parks ────────────────────────────────────────────────┐ │
 *   │  │  INSERT  → /park/new, /county/?(new), /obstacle·N,     │ │
 *   │  │            /, /map/                                    │ │
 *   │  │  UPDATE  → above + /park/old (slug∆), /county/old (∆), │ │
 *   │  │            /obstacle·N (status flip only)              │ │
 *   │  │  DELETE  → /park/old, /county/old, /, /map/            │ │
 *   │  │            (obstacles handled by cascade webhooks)     │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   │                                                             │
 *   │  ┌─ park_obstacles ───────────────────────────────────────┐ │
 *   │  │  INSERT/DELETE → /park/<slug>, /obstacle/<X>           │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   │                                                             │
 *   │  ┌─ park_photos ──────────────────────────────────────────┐ │
 *   │  │  any → /park, /county, /obstacle·N, /                  │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   │                                                             │
 *   │  ┌─ other child (links/amenities/etc) ────────────────────┐ │
 *   │  │  any → /park/<slug> only                               │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Null-guard on slugForCounty: if Studio has a typo'd county not in
 * src/lib/counties.ts, skip the /county path and surface the unknown in
 * `warnings`. The /admin/lint orphan-county chip catches the same condition
 * post-hoc; this is the runtime guard so we don't call
 * revalidatePath('/county/undefined').
 */
export async function resolvePaths(
  payload: WebhookPayload,
  db: ResolverDb,
): Promise<ResolveResult> {
  const paths = new Set<string>();
  const warnings: string[] = [];

  if (!KNOWN_TABLES.has(payload.table)) {
    warnings.push(`unknown table: ${payload.table}`);
    return { paths: [], parkIdForTimestamp: null, warnings };
  }

  // Tracks the park id we'll bump last_revalidated_at on. Null = parent gone.
  let parkIdForTimestamp: number | null = null;

  const newRow = payload.record ?? null;
  const oldRow = payload.old_record ?? null;

  if (payload.table === "parks") {
    // Site-wide discovery surfaces — homepage list + map — depend on the full
    // open-parks list, so any parks-row change fans out to both.
    paths.add("/");
    paths.add("/map");

    if (payload.type === "INSERT" && newRow) {
      const slug = asString(newRow.slug);
      if (slug) paths.add(`/park/${slug}`);
      addCountyPath(paths, asString(newRow.county), warnings);
      // Obstacle archives are populated by separate park_obstacles INSERT
      // webhooks that fire as each obstacle is assigned. Skip here to avoid
      // a redundant DB lookup.
      parkIdForTimestamp = asInt(newRow.id);
    } else if (payload.type === "UPDATE" && newRow) {
      const slug = asString(newRow.slug);
      const oldSlug = asString(oldRow?.slug);
      if (slug) paths.add(`/park/${slug}`);
      if (oldSlug && oldSlug !== slug) paths.add(`/park/${oldSlug}`);

      addCountyPath(paths, asString(newRow.county), warnings);
      const oldCounty = asString(oldRow?.county);
      if (oldCounty && oldCounty !== asString(newRow.county)) {
        addCountyPath(paths, oldCounty, warnings);
      }

      const oldStatus = asString(oldRow?.status);
      const newStatus = asString(newRow.status);
      if (oldStatus && newStatus && oldStatus !== newStatus) {
        // Status flip = park added to or removed from every archive it's tagged
        // on. Look up its obstacles and fan out.
        const parkId = asInt(newRow.id);
        if (parkId != null) {
          const obs = await db
            .select({ obstacle: parkObstacles.obstacle })
            .from(parkObstacles)
            .where(eq(parkObstacles.parkId, parkId));
          for (const { obstacle } of obs) {
            paths.add(`/obstacle/${obstacleSlug(obstacle as ObstacleType)}`);
          }
        }
      }
      parkIdForTimestamp = asInt(newRow.id);
    } else if (payload.type === "DELETE" && oldRow) {
      const oldSlug = asString(oldRow.slug);
      if (oldSlug) paths.add(`/park/${oldSlug}`);
      addCountyPath(paths, asString(oldRow.county), warnings);
      // Obstacles for the deleted park are cascade-deleted from park_obstacles.
      // Each cascade-deleted row fires its own park_obstacles DELETE webhook
      // (Postgres AFTER triggers fire on cascades), and THOSE webhooks
      // revalidate the /obstacle archives. So nothing to fan out here.
      parkIdForTimestamp = null; // nothing to bump — the park is gone
    }
  } else if (payload.table === "park_obstacles") {
    // (park_id, obstacle) composite PK — DEFAULT replica identity exposes both.
    // The migration sets FULL anyway for consistency.
    const parkId = asInt(newRow?.park_id ?? oldRow?.park_id);
    const obstacleNew = asString(newRow?.obstacle);
    const obstacleOld = asString(oldRow?.obstacle);

    if (parkId != null) {
      const park = await fetchParkBasics(db, parkId);
      if (park?.slug) paths.add(`/park/${park.slug}`);
      parkIdForTimestamp = park ? parkId : null;
    }
    if (obstacleNew) paths.add(`/obstacle/${obstacleSlug(obstacleNew as ObstacleType)}`);
    if (obstacleOld && obstacleOld !== obstacleNew) {
      paths.add(`/obstacle/${obstacleSlug(obstacleOld as ObstacleType)}`);
    }
  } else if (payload.table === "park_photos") {
    // Hero photo (sort_order = lowest) shows on / + every taxonomy archive
    // the park is on. Conservative: revalidate ALL three surfaces for any
    // park_photos change, even though only sort_order=0 swaps actually move
    // the hero. The cost is bounded (~10 revalidatePath calls per park).
    const parkId = asInt(newRow?.park_id ?? oldRow?.park_id);
    if (parkId != null) {
      const park = await fetchParkBasics(db, parkId);
      if (park) {
        paths.add(`/park/${park.slug}`);
        paths.add("/"); // hero thumbnail on homepage card
        addCountyPath(paths, park.county, warnings);
        const obs = await db
          .select({ obstacle: parkObstacles.obstacle })
          .from(parkObstacles)
          .where(eq(parkObstacles.parkId, parkId));
        for (const { obstacle } of obs) {
          paths.add(`/obstacle/${obstacleSlug(obstacle as ObstacleType)}`);
        }
        parkIdForTimestamp = parkId;
      }
    }
  } else {
    // park_links, park_amenities, park_renovations, park_riding_surfaces,
    // park_builders — these only affect the profile page, not any archive.
    const parkId = asInt(newRow?.park_id ?? oldRow?.park_id);
    if (parkId != null) {
      const park = await fetchParkBasics(db, parkId);
      if (park?.slug) {
        paths.add(`/park/${park.slug}`);
        parkIdForTimestamp = parkId;
      }
    }
  }

  return { paths: [...paths], parkIdForTimestamp, warnings };
}

async function fetchParkBasics(
  db: ResolverDb,
  parkId: number,
): Promise<{ slug: string; county: string | null } | null> {
  const rows = await db
    .select({ slug: parks.slug, county: parks.county })
    .from(parks)
    .where(eq(parks.id, parkId))
    .limit(1);
  return rows[0] ?? null;
}

function addCountyPath(
  out: Set<string>,
  countyDisplayName: string | null,
  warnings: string[],
): void {
  if (!countyDisplayName) return;
  const slug = slugForCounty(countyDisplayName);
  if (!slug) {
    warnings.push(
      `unknown county "${countyDisplayName}" — not in src/lib/counties.ts. ` +
        `Park will be orphaned from /county archives until added.`,
    );
    return;
  }
  out.add(`/county/${slug}`);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}
