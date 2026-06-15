import "server-only";

import { and, asc, eq, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import { parkPhotos, parks } from "@/db/schema";
import { COUNTIES } from "@/lib/counties";

import type { ResolverDb } from "@/lib/revalidate-resolver";

// Data-quality checks for /admin/lint (phase 9 4A — all 4 chips ship in v1).
//
// Two flavors:
//   • Technical-health signals: orphan counties, stale revalidate.
//     If these accumulate, production breaks (404 archives, broken webhook).
//   • Content-backfill queues: stub parks (NULL coords), no photos.
//     Useful visibility, owner-actionable, not blocking.
//
// All four are pure async functions taking the pooled db client. They run in
// parallel via Promise.all from the dashboard page, so the slowest dictates
// page latency — currently all 4 are <50ms against the ~150-row dataset.

export type ChipSeverity = "warning" | "info";

export interface ParkSummary {
  id: number;
  slug: string;
  name: string;
  city: string;
}

export interface Chip {
  key: "orphan_counties" | "stale_revalidate" | "null_coords" | "no_photos";
  title: string;
  severity: ChipSeverity;
  count: number;
  description: string;
  rows: ParkSummary[];
}

const SUMMARY_COLUMNS = {
  id: parks.id,
  slug: parks.slug,
  name: parks.name,
  city: parks.city,
} as const;

/**
 * Parks whose `county` value isn't in src/lib/counties.ts. Runtime mirror of
 * the build-time `assertCountiesInData` check — surfaces drift introduced by
 * a Studio edit before the next deploy catches it (closes the phase 8 P2 TODO).
 *
 * Returns one row per orphaned park (not per unique county) so the owner can
 * jump straight to the park profile to fix the typo.
 */
export async function getOrphanCounties(db: ResolverDb): Promise<Chip> {
  const knownDisplayNames = COUNTIES.map((c) => c.displayName);
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(parks)
    .where(and(isNotNull(parks.county), notInArray(parks.county, knownDisplayNames)))
    .orderBy(asc(parks.name));

  return {
    key: "orphan_counties",
    title: "Orphan counties",
    severity: "warning",
    count: rows.length,
    description:
      "Parks whose `county` value doesn't match any entry in src/lib/counties.ts. " +
      "These parks render at /park/<slug> but are absent from every /county archive " +
      "and won't be revalidated by /api/revalidate. Fix the Studio value or add " +
      "the county to counties.ts.",
    rows,
  };
}

/**
 * Parks whose `last_revalidated_at` is older than the threshold (default 30d)
 * OR null. A stale value is the canonical signal that /api/revalidate isn't
 * firing for this slug — either a webhook is misconfigured, the bearer secret
 * rotated without updating Supabase, or the route is throwing 5xx and
 * Supabase exhausted its retry budget. Null = never revalidated since the
 * column was added (phase 5 migration default).
 */
export async function getStaleRevalidate(
  db: ResolverDb,
  thresholdDays = 30,
): Promise<Chip> {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  // Drizzle's `lt` knows parks.lastRevalidatedAt is a typed timestamp column
  // and serializes the Date for postgres-js. A raw `sql\`< ${cutoff}\`` template
  // would pass the Date through as an opaque value and crash with
  // "argument must be of type string or Buffer". Use typed ops.
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(parks)
    .where(
      and(
        eq(parks.status, "open"),
        or(isNull(parks.lastRevalidatedAt), lt(parks.lastRevalidatedAt, cutoff)),
      ),
    )
    .orderBy(asc(parks.name));

  return {
    key: "stale_revalidate",
    title: `Stale revalidate (>${thresholdDays}d)`,
    severity: "warning",
    count: rows.length,
    description:
      `Open parks whose last_revalidated_at is older than ${thresholdDays} days ` +
      "or null. If this count is growing, the webhook pipeline likely has a " +
      "configuration drift — check Supabase Webhooks UI for failing deliveries " +
      "and verify the bearer secret matches REVALIDATE_SECRET.",
    rows,
  };
}

/**
 * Parks missing latitude OR longitude. These render at /park/<slug> but are
 * excluded from /map/ and from the Nearby Parks haversine compute. Mostly the
 * 99 stub parks that came over from WP without coords (per F2 migration).
 * Owner-actionable backfill queue.
 */
export async function getParksWithoutCoords(db: ResolverDb): Promise<Chip> {
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(parks)
    .where(sql`(${parks.lat} IS NULL OR ${parks.lng} IS NULL)`)
    .orderBy(asc(parks.name));

  return {
    key: "null_coords",
    title: "Missing coordinates",
    severity: "info",
    count: rows.length,
    description:
      "Parks with NULL lat or lng. They still render at /park/<slug> but won't " +
      "appear on /map/ or in Nearby Parks suggestions. Backfill via Studio when " +
      "convenient.",
    rows,
  };
}

/**
 * Parks with zero rows in park_photos. They render the branded gray fallback
 * placeholder per F2. Owner content-backfill queue.
 *
 * Uses NOT EXISTS rather than a LEFT JOIN — clearer intent and tighter result
 * set than COUNT(*) = 0 over a join.
 */
export async function getParksWithoutPhotos(db: ResolverDb): Promise<Chip> {
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(parks)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${parkPhotos} WHERE ${parkPhotos.parkId} = ${parks.id})`,
    )
    .orderBy(asc(parks.name));

  return {
    key: "no_photos",
    title: "No photos",
    severity: "info",
    count: rows.length,
    description:
      "Parks with zero park_photos rows. They render the branded gray placeholder. " +
      "Backfill by uploading at least one photo via Supabase Studio's Storage UI.",
    rows,
  };
}

/**
 * A chip that failed to load — surfaced to the dashboard so the page renders
 * partial data instead of erroring entirely. The owner sees which check broke
 * (and the error message for triage) without losing the working chips.
 */
export interface ChipError {
  key: Chip["key"] | "unknown";
  title: string;
  error: string;
}

export type ChipResult = { ok: true; chip: Chip } | { ok: false; error: ChipError };

/**
 * Run all 4 checks in parallel via Promise.allSettled — one query failing
 * (statement timeout, transient pool exhaustion, etc.) doesn't kill the rest.
 * The dashboard renders each chip independently and shows an error tile for
 * any that rejected, with the Postgres error message for triage.
 */
export async function getAllLintChips(db: ResolverDb): Promise<ChipResult[]> {
  const settled = await Promise.allSettled([
    ["orphan_counties", "Orphan counties", () => getOrphanCounties(db)] as const,
    ["stale_revalidate", "Stale revalidate", () => getStaleRevalidate(db)] as const,
    ["null_coords", "Missing coordinates", () => getParksWithoutCoords(db)] as const,
    ["no_photos", "No photos", () => getParksWithoutPhotos(db)] as const,
  ].map(async ([key, title, fn]) => {
    try {
      return { key, title, chip: await fn() } as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw { key, title, message };
    }
  }));

  return settled.map((result): ChipResult => {
    if (result.status === "fulfilled") {
      return { ok: true, chip: result.value.chip };
    }
    const reason = result.reason as { key?: Chip["key"]; title?: string; message?: string };
    return {
      ok: false,
      error: {
        key: reason.key ?? "unknown",
        title: reason.title ?? "Unknown check",
        error: reason.message ?? String(result.reason),
      },
    };
  });
}

// Re-exports so callers don't need to import drizzle operators directly.
export { isNull, lt };
