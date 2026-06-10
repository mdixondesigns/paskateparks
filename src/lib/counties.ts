// Phase 8 — Static map for PA county taxonomy archives.
//
// `parks.county` is stored as the WP term name (display label, e.g. "Bucks").
// This map is the source of truth for /county/[slug] routes and provides:
//   • slug ↔ display-name roundtrip
//   • the bounded list generateStaticParams iterates
//   • a build-time sanity check that catches Studio drift before deploy
//
// Locked decision 2A (plan-eng-review): schema stays TEXT, drift is gated by
// `assertCountiesInData` at build time. Locked decision 1A: counties source
// also drives phase-9 webhook revalidation (the resolver needs to know which
// archive paths exist).
//
// WP source: /regions_and_counties/<slug>/ taxonomy term slugs (verified from
// data/wp-export/mysql.sql wp_terms rows). For the current 14 PA counties,
// `slug === displayName.toLowerCase()` — but the map encodes slugs explicitly
// so a future county with whitespace (e.g. "Mc Kean" → "mckean") slots in
// without re-thinking the helper.

export interface County {
  slug: string;
  displayName: string;
}

export const COUNTIES = [
  { slug: "allegheny", displayName: "Allegheny" },
  { slug: "berks", displayName: "Berks" },
  { slug: "blair", displayName: "Blair" },
  { slug: "bucks", displayName: "Bucks" },
  { slug: "butler", displayName: "Butler" },
  { slug: "chester", displayName: "Chester" },
  { slug: "delaware", displayName: "Delaware" },
  { slug: "lancaster", displayName: "Lancaster" },
  { slug: "lehigh", displayName: "Lehigh" },
  { slug: "montgomery", displayName: "Montgomery" },
  { slug: "northampton", displayName: "Northampton" },
  { slug: "perry", displayName: "Perry" },
  { slug: "philadelphia", displayName: "Philadelphia" },
  { slug: "york", displayName: "York" },
] as const satisfies readonly County[];

export type CountySlug = (typeof COUNTIES)[number]["slug"];

const bySlug = new Map<string, County>(COUNTIES.map((c) => [c.slug, c]));
const byNormalizedName = new Map<string, County>(
  COUNTIES.map((c) => [normalize(c.displayName), c]),
);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Returns the County for a URL slug, or undefined when the slug isn't one of
// the 14 known counties. Mirrors obstacleForSlug — caller falls to notFound().
export function countyForSlug(slug: string): County | undefined {
  return bySlug.get(slug);
}

// Returns the URL slug for a display name (the form stored in parks.county).
// Tolerant of whitespace + case so Studio entries like "bucks" or "  Bucks  "
// still resolve. Returns undefined for unknown names — callers should treat
// that as a data problem (build fails via assertCountiesInData).
export function slugForCounty(displayName: string): string | undefined {
  return byNormalizedName.get(normalize(displayName))?.slug;
}

// Build-time sanity check (locked 2A + codex #12): every parks.county value
// must resolve to a known county. Throws with the distinct list of unknowns
// so a Studio typo fails the deploy loudly instead of silently orphaning a
// park from its archive.
//
// Tolerates:  null / undefined / empty / whitespace-only (skipped)
//             case + whitespace differences (normalized before compare)
// Strict on:  any other non-empty value not in COUNTIES
export function assertCountiesInData(
  parkCounties: ReadonlyArray<string | null | undefined>,
): void {
  const unknown = new Set<string>();
  for (const raw of parkCounties) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    if (!byNormalizedName.has(normalize(trimmed))) {
      unknown.add(trimmed);
    }
  }
  if (unknown.size > 0) {
    const list = [...unknown].sort().map((s) => JSON.stringify(s)).join(", ");
    throw new Error(
      `assertCountiesInData: ${unknown.size} parks.county value(s) not in COUNTIES map: ${list}. ` +
        `Add to src/lib/counties.ts or fix the Studio data.`,
    );
  }
}
