/**
 * Phase 6 P1-D — data quality precondition for the homepage's geolocation
 * feature. Asserts every NON-NULL park lat/lng pair is finite and in bounds.
 *
 * NULL coordinates are LEGAL in the schema (per STACK-PIVOT.md finding #2 —
 * 99 stub parks don't have coords yet). They're reported in a separate
 * tally so the owner can see how many stubs remain, but they do NOT fail
 * the check. The homepage filters out rows that would crash the sort via
 * findNearby's null-coord guard (src/lib/nearby.ts).
 *
 * What WILL fail the check: NaN, Infinity, or values outside lat ∈ [-90, 90]
 * / lng ∈ [-180, 180]. These would silently corrupt the client-side
 * Haversine sort and produce 'NaN miles' pills.
 *
 * Exit codes:
 *   0 → all non-null rows valid (NULL rows tallied, not blocking)
 *   1 → one or more rows have bad finite/bounds data (details printed)
 *   2 → setup/runtime error (missing DIRECT_URL, DB unreachable, unexpected throw)
 *
 * Run via:
 *   pnpm db:check-coords
 */

import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: ".env.local" });

interface ParkRow {
  id: number;
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

interface Problem {
  park: ParkRow;
  reason: string;
}

function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

function isValidLng(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error("DIRECT_URL not set in .env.local");
    process.exit(2);
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    // Pull all parks, regardless of status. Stub parks (status='open' but no
    // coords yet) are caught here too, since they would appear on the homepage.
    const rows = await sql<ParkRow[]>`
      SELECT id, slug, name, lat, lng
      FROM parks
      ORDER BY name
    `;

    console.log(`Checking ${rows.length} parks for valid coordinates…`);

    const problems: Problem[] = [];
    let nullCount = 0;

    for (const park of rows) {
      if (park.lat === null || park.lng === null) {
        // NULL coords are legal in the schema (99 stub parks per STACK-PIVOT.md).
        // We count them but don't fail — the homepage filter still works and
        // findNearby drops them defensively. This is a tally for visibility.
        nullCount++;
        continue;
      }
      if (!isValidLat(park.lat)) {
        problems.push({ park, reason: `lat=${park.lat} out of bounds or non-finite` });
      }
      if (!isValidLng(park.lng)) {
        problems.push({ park, reason: `lng=${park.lng} out of bounds or non-finite` });
      }
    }

    const withCoords = rows.length - nullCount;
    console.log(`  Parks with coords:    ${withCoords}`);
    console.log(`  Parks with NULL:      ${nullCount}  (legal — stub parks)`);
    console.log(`  Parks with bad data:  ${problems.length}`);

    if (problems.length > 0) {
      console.error("\n✗ FAIL — invalid coordinates detected:");
      for (const { park, reason } of problems) {
        console.error(`  • park #${park.id} "${park.name}" (slug=${park.slug}): ${reason}`);
      }
      process.exit(1);
    }

    console.log("\n✓ OK — every park with coords has valid, in-bounds values.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
