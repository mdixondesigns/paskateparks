import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { hasCoords } from "./park-query";

// Phase 7 plan-eng-review 1C + CMT-2 — park-query tests focus on the two
// behaviors phase 7 introduces:
//
//   1. SQL-level: getAllParksForNearby filters status='open' (D11 trust
//      regression boundary — the latent bug on /park/<slug> Nearby Parks
//      adversarial review caught on / in phase 6).
//   2. TS-level: getOpenParksForMap narrows the row type via the exported
//      hasCoords predicate so MapView's consumer code doesn't have to
//      non-null-assert lat/lng.
//
// The SQL contract is verified via a source-code regression test (the
// codebase does not stand up Postgres for unit tests; existing patterns mock
// query functions, not their bodies). Crude but bulletproof — if someone
// deletes the status='open' filter the test fails.

function fnBody(name: string): string {
  const path = resolve(process.cwd(), "src/lib/park-query.ts");
  const source = readFileSync(path, "utf-8");
  const fnStart = source.indexOf(`export async function ${name}`);
  expect(fnStart, `${name} export not found`).toBeGreaterThan(-1);
  // Find the end of this function: the next `\n}\n` after fnStart.
  const fnEnd = source.indexOf("\n}\n", fnStart);
  expect(fnEnd, `could not find end of ${name} body`).toBeGreaterThan(fnStart);
  return source.slice(fnStart, fnEnd);
}

describe("getAllParksForNearby — D11 status='open' filter (regression boundary)", () => {
  it("source contains eq(parks.status, 'open') in the function body", () => {
    const body = fnBody("getAllParksForNearby");
    expect(body, "missing eq(parks.status, 'open') filter").toMatch(
      /eq\(parks\.status,\s*["']open["']\)/,
    );
    expect(body, "missing isNotNull(parks.lat)").toMatch(/isNotNull\(parks\.lat\)/);
    expect(body, "missing isNotNull(parks.lng)").toMatch(/isNotNull\(parks\.lng\)/);
  });
});

// Phase 8 plan-eng-review 3A + CMT-5A — taxonomy archive queries enforce the
// same status='open' D11 filter as the discovery surfaces above, plus the
// JOIN shape required to feed the /county/[slug] and /obstacle/[slug] pages.
// The source-regex pattern catches:
//   • dropped filter (and/or swap fails the and() check too)
//   • missing JOIN on parkObstacles
//   • wrong sort column
//   • selectDistinct removed (would render duplicate routes)

describe("getParksByCounty — phase 8 D11 filter + JOIN shape (CMT-5A)", () => {
  it("filters status='open' (discovery surface, must exclude closed)", () => {
    expect(fnBody("getParksByCounty")).toMatch(/eq\(parks\.status,\s*["']open["']\)/);
  });

  it("filters by parks.county", () => {
    expect(fnBody("getParksByCounty")).toMatch(/eq\(parks\.county,/);
  });

  it("composes filters with and() (catches and/or swap)", () => {
    expect(fnBody("getParksByCounty")).toMatch(/and\(/);
  });

  it("orders alpha by parks.name", () => {
    expect(fnBody("getParksByCounty")).toMatch(/orderBy\(asc\(parks\.name\)\)/);
  });

  it("joins hero photos via getHeroPhotoFor", () => {
    expect(fnBody("getParksByCounty")).toMatch(/getHeroPhotoFor\(/);
  });

  it("returns [] on empty rows without re-querying photos (perf)", () => {
    expect(fnBody("getParksByCounty")).toMatch(/rows\.length === 0/);
  });
});

describe("getParksByObstacle — phase 8 D11 filter + JOIN shape (CMT-5A)", () => {
  it("filters status='open' (discovery surface, must exclude closed)", () => {
    expect(fnBody("getParksByObstacle")).toMatch(/eq\(parks\.status,\s*["']open["']\)/);
  });

  it("innerJoin park_obstacles on park_id (the JOIN is the whole point)", () => {
    expect(fnBody("getParksByObstacle")).toMatch(
      /innerJoin\(\s*parkObstacles,\s*eq\(parkObstacles\.parkId,\s*parks\.id\)/,
    );
  });

  it("filters by parkObstacles.obstacle", () => {
    expect(fnBody("getParksByObstacle")).toMatch(/eq\(parkObstacles\.obstacle,/);
  });

  it("composes filters with and() (catches and/or swap)", () => {
    expect(fnBody("getParksByObstacle")).toMatch(/and\(/);
  });

  it("orders alpha by parks.name", () => {
    expect(fnBody("getParksByObstacle")).toMatch(/orderBy\(asc\(parks\.name\)\)/);
  });

  it("joins hero photos via getHeroPhotoFor", () => {
    expect(fnBody("getParksByObstacle")).toMatch(/getHeroPhotoFor\(/);
  });
});

describe("getCountiesWithOpenParks — generateStaticParams feed (phase 8)", () => {
  it("filters status='open' so empty-after-close counties are dropped", () => {
    expect(fnBody("getCountiesWithOpenParks")).toMatch(
      /eq\(parks\.status,\s*["']open["']\)/,
    );
  });

  it("ignores parks with null county", () => {
    expect(fnBody("getCountiesWithOpenParks")).toMatch(/isNotNull\(parks\.county\)/);
  });

  it("uses selectDistinct (one row per county, not per park)", () => {
    expect(fnBody("getCountiesWithOpenParks")).toMatch(/selectDistinct/);
  });
});

describe("getObstaclesWithOpenParks — generateStaticParams feed (phase 8)", () => {
  it("filters status='open' on the joined parks side", () => {
    expect(fnBody("getObstaclesWithOpenParks")).toMatch(
      /eq\(parks\.status,\s*["']open["']\)/,
    );
  });

  it("uses selectDistinct (one row per obstacle, not per row)", () => {
    expect(fnBody("getObstaclesWithOpenParks")).toMatch(/selectDistinct/);
  });

  it("innerJoin parks on park_obstacles.park_id", () => {
    expect(fnBody("getObstaclesWithOpenParks")).toMatch(
      /innerJoin\(\s*parks,\s*eq\(parks\.id,\s*parkObstacles\.parkId\)/,
    );
  });
});

describe("hasCoords — type predicate for getOpenParksForMap (CMT-2)", () => {
  const baseRow = { id: 1, slug: "x", name: "X", city: "C", state: "PA" };

  it("returns true for rows with both lat and lng as numbers", () => {
    expect(hasCoords({ ...baseRow, lat: 39.95, lng: -75.16 })).toBe(true);
  });

  it("returns false for rows with null lat", () => {
    expect(hasCoords({ ...baseRow, lat: null, lng: -75.16 })).toBe(false);
  });

  it("returns false for rows with null lng", () => {
    expect(hasCoords({ ...baseRow, lat: 39.95, lng: null })).toBe(false);
  });

  it("returns false for rows with both null", () => {
    expect(hasCoords({ ...baseRow, lat: null, lng: null })).toBe(false);
  });

  it("A3 (ship-review): rejects NaN / Infinity coords (defense-in-depth)", () => {
    expect(hasCoords({ ...baseRow, lat: Number.NaN, lng: -75 })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: 40, lng: Number.NaN })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: Number.POSITIVE_INFINITY, lng: -75 })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: 40, lng: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it("A3 (ship-review): rejects out-of-bounds coords (CMS typo defense)", () => {
    expect(hasCoords({ ...baseRow, lat: 999, lng: -75 })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: -91, lng: -75 })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: 40, lng: 200 })).toBe(false);
    expect(hasCoords({ ...baseRow, lat: 40, lng: -181 })).toBe(false);
  });

  it("A3 (ship-review): accepts boundary coords (lat=90, lng=180; lat=-90, lng=-180)", () => {
    expect(hasCoords({ ...baseRow, lat: 90, lng: 180 })).toBe(true);
    expect(hasCoords({ ...baseRow, lat: -90, lng: -180 })).toBe(true);
  });

  it("filter() composition: drops null-coord rows from a mixed array", () => {
    const mixed = [
      { ...baseRow, id: 1, slug: "fdr", lat: 39.91, lng: -75.18 },
      { ...baseRow, id: 2, slug: "stub", lat: null, lng: null },
      { ...baseRow, id: 3, slug: "half1", lat: 40, lng: null },
      { ...baseRow, id: 4, slug: "half2", lat: null, lng: -76 },
      { ...baseRow, id: 5, slug: "bayne", lat: 40.5, lng: -80.05 },
    ];
    const narrowed = mixed.filter(hasCoords);
    expect(narrowed).toHaveLength(2);
    expect(narrowed.map((r) => r.slug)).toEqual(["fdr", "bayne"]);
    // Type-narrowing: at compile time TS sees lat/lng as `number`, not
    // `number | null`. Verify the runtime invariant matches.
    for (const row of narrowed) {
      expect(typeof row.lat).toBe("number");
      expect(typeof row.lng).toBe("number");
    }
  });
});
