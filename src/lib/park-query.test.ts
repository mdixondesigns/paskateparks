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

describe("getAllParksForNearby — D11 status='open' filter (regression boundary)", () => {
  it("source contains eq(parks.status, 'open') in the function body", () => {
    // resolve from cwd (repo root in vitest) — works regardless of how Vite
    // resolves import.meta.url, which can be a non-file URL scheme.
    const path = resolve(process.cwd(), "src/lib/park-query.ts");
    const source = readFileSync(path, "utf-8");
    const fnStart = source.indexOf("export async function getAllParksForNearby");
    expect(fnStart, "getAllParksForNearby export not found").toBeGreaterThan(-1);
    // Find the end of this function: the next `\n}\n` after fnStart.
    const fnEnd = source.indexOf("\n}\n", fnStart);
    expect(fnEnd, "could not find end of getAllParksForNearby body").toBeGreaterThan(fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody, "missing eq(parks.status, 'open') filter").toMatch(
      /eq\(parks\.status,\s*["']open["']\)/,
    );
    expect(fnBody, "missing isNotNull(parks.lat)").toMatch(/isNotNull\(parks\.lat\)/);
    expect(fnBody, "missing isNotNull(parks.lng)").toMatch(/isNotNull\(parks\.lng\)/);
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
