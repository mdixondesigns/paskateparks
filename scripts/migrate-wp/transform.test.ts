/**
 * Transform layer tests.
 *
 * Strategy: integration-heavy against the real WP dump (where present), with
 * a handful of pure-unit tests for the most fragile internal logic.
 *
 * Why integration-heavy: the transform is a composition of many small
 * functions. Real-data invariants (e.g., "all 48 parks have lat/lng",
 * "every obstacle slug maps to a valid enum value") catch more bugs than
 * mocked unit tests would, and they pin the contract the migration script
 * actually depends on. Pure-unit tests for trivial helpers add noise.
 *
 * Skipped automatically if `data/wp-export/mysql.sql` isn't present (CI).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { phpUnserialize } from "./php-unserialize";
import {
  buildersFromContext,
  parksFromContext,
  shopsFromContext,
} from "./transform";
import { loadWpContext, type WpContext } from "./wp-context";

const DUMP_PATH = resolve(process.cwd(), "data/wp-export/mysql.sql");
const haveDump = existsSync(DUMP_PATH);

describe.skipIf(!haveDump)("transform — real-dump integration", () => {
  let ctx: WpContext;

  // The transform logs warnings for unrecognized support labels (handled
  // gracefully — default to "other"). Suppress for test output cleanliness.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("loads the WP context exactly once for the whole suite", () => {
    // Cache the context once — load+transform is ~80ms so re-running per-test
    // is fine, but caching makes the suite snappier.
    ctx = loadWpContext(DUMP_PATH);
    expect(ctx.posts.size).toBeGreaterThan(0);
  });

  // ─── Top-level invariants ────────────────────────────────────────────────

  it("transforms exactly 48 published parks, 14 builders, 20 shops", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    expect(parksFromContext(ctx)).toHaveLength(48);
    expect(buildersFromContext(ctx)).toHaveLength(14);
    expect(shopsFromContext(ctx)).toHaveLength(20);
  });

  it("every park has a valid lat/lng (location ACF or wpgmza fallback)", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const parks = parksFromContext(ctx);
    for (const p of parks) {
      expect(p.lat, `${p.slug} lat`).not.toBeNull();
      expect(p.lng, `${p.slug} lng`).not.toBeNull();
      // Sanity: PA is roughly 39.7 < lat < 42.3 and -80.5 < lng < -74.7.
      // A few border-area shops might fall outside; for parks we expect all in.
      if (p.lat != null) expect(p.lat).toBeGreaterThan(39);
      if (p.lat != null) expect(p.lat).toBeLessThan(43);
      if (p.lng != null) expect(p.lng).toBeGreaterThan(-81);
      if (p.lng != null) expect(p.lng).toBeLessThan(-74);
    }
  });

  it("every park has a status in the enum vocabulary", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const valid = new Set(["open", "temporarily_closed", "permanently_closed"]);
    for (const p of parksFromContext(ctx)) {
      expect(valid.has(p.status), `${p.slug} status=${p.status}`).toBe(true);
    }
  });

  it("every obstacle on every park is in our 38-value enum", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const validObstacles = new Set([
      "grind_box_ledge", "quarter_pipe", "flat_rail", "bank_wedge", "hubba",
      "manual_pad", "funbox", "hip", "handrail", "curb", "pyramid",
      "kicker_launch_ramp", "stair", "wallride", "mini_ramp", "spine",
      "euro_london_gap", "pool_bowl", "extension", "gap", "roll_in",
      "volcano", "jersey_barrier", "a_frame", "amoeba_pool", "box_jump",
      "picnic_table", "pole", "rainbow_rail", "escalator", "full_pipe",
      "cradle_over_vert", "snake_run", "fire_hydrant", "whoop_dee_doo",
      "foam_pit", "mega_ramp", "pump_track",
    ]);
    for (const p of parksFromContext(ctx)) {
      for (const o of p.obstacles) {
        expect(validObstacles.has(o), `${p.slug} obstacle=${o}`).toBe(true);
      }
    }
  });

  it("every park has 7 amenity rows (D18 universal model)", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    for (const p of parksFromContext(ctx)) {
      expect(p.amenities, p.slug).toHaveLength(7);
      const types = new Set(p.amenities.map((a) => a.type));
      expect(types.size).toBe(7); // no duplicates
    }
  });

  // ─── FDR end-to-end pinned assertions ───────────────────────────────────

  it("FDR transforms to the expected payload shape", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const fdr = parksFromContext(ctx).find((p) => p.slug === "fdr");
    expect(fdr).toBeDefined();
    if (!fdr) return;

    expect(fdr.name).toBe("FDR");
    expect(fdr.status).toBe("open");
    expect(fdr.city).toBe("Philadelphia");
    expect(fdr.state).toBe("PA");
    expect(fdr.zip).toBe("19148");
    expect(fdr.county).toBe("Philadelphia");
    expect(fdr.establishedYear).toBe(1995);
    expect(fdr.squareFootage).toBe(16000);
    expect(fdr.parkType).toBe("diy_park");
    expect(fdr.helmets).toBe("none_posted");
    expect(fdr.otherPadsRequired).toBe(false);
    expect(fdr.fee).toBe(false);
    expect(fdr.allowsSkateboards).toBe(true);
    expect(fdr.allowsBikes).toBe(true);

    // Precise lat/lng from ACF location (Google Places parse)
    expect(fdr.lat).toBeCloseTo(39.8984981, 5);
    expect(fdr.lng).toBeCloseTo(-75.179744, 5);

    expect(fdr.ridingSurfaces).toEqual(["concrete"]);
    expect(fdr.obstacles).toHaveLength(21);
    expect(fdr.builderNames).toEqual(["DIY"]);
    expect(fdr.photos).toHaveLength(28);

    // Renovation: FDR has years_refurbished_0_year = 2022
    expect(fdr.renovations).toEqual([
      { year: 2022, notes: null, sortOrder: 0 },
    ]);

    // Links — 1 website + 2 IG + 1 FB + 1 GoFundMe
    const linkTypes = fdr.links.map((l) => l.type).sort();
    expect(linkTypes).toEqual(["facebook", "gofundme", "instagram", "instagram", "website"]);
    const ig = fdr.links.filter((l) => l.type === "instagram");
    expect(ig[0]?.label).toBe("@fdrskatepark");
    expect(ig[0]?.url).toBe("https://instagram.com/fdrskatepark");
    expect(ig[1]?.label).toBe("@fdrhatesyou");
  });

  it("FDR's first photo resolves to the expected upload path", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const fdr = parksFromContext(ctx).find((p) => p.slug === "fdr");
    expect(fdr).toBeDefined();
    if (!fdr) return;
    expect(fdr.photos[0]?.wpAttachmentId).toBe(256);
    expect(fdr.photos[0]?.wpFilePath).toBe("2021/12/FDR_16.jpg");
    expect(fdr.photos[0]?.sortOrder).toBe(0);
  });

  // ─── Specific real-data findings the probe surfaced ──────────────────────

  it("Lancaster County Skatepark gets helmets=required_all_ages + pads=true", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const lc = parksFromContext(ctx).find((p) => p.slug === "lancaster-county-skatepark");
    expect(lc).toBeDefined();
    if (!lc) return;
    expect(lc.helmets).toBe("required_all_ages");
    expect(lc.otherPadsRequired).toBe(true);
  });

  it("Patrick Kerr Memorial gets helmets=required_all_ages + pads=false (Helmet Only)", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const pk = parksFromContext(ctx).find((p) => p.slug === "patrick-kerr-memorial-skatepark");
    expect(pk).toBeDefined();
    if (!pk) return;
    expect(pk.helmets).toBe("required_all_ages");
    expect(pk.otherPadsRequired).toBe(false);
  });

  // ─── Shop transforms ─────────────────────────────────────────────────────

  it("every shop has a non-null state code", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    for (const s of shopsFromContext(ctx)) {
      expect(s.state, s.name).toMatch(/^[A-Z]{2}$/);
    }
  });

  // ─── Builder transforms ──────────────────────────────────────────────────

  it('"DIY" is one of the builders (FDR depends on this name match)', () => {
    ctx ??= loadWpContext(DUMP_PATH);
    const names = new Set(buildersFromContext(ctx).map((b) => b.name));
    expect(names.has("DIY")).toBe(true);
  });

  it("every builder has a non-empty name and an integer wpPostId", () => {
    ctx ??= loadWpContext(DUMP_PATH);
    for (const b of buildersFromContext(ctx)) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(b.wpPostId)).toBe(true);
    }
  });
});

// ─── A few pure-unit tests for the fragile bits ───────────────────────────

describe("phpUnserialize integration (used heavily by transform)", () => {
  it("decodes a realistic FDR location-style ACF assoc array", () => {
    const raw =
      'a:3:{s:7:"address";s:5:"test1";s:3:"lat";d:39.5;s:3:"lng";d:-75.5;}';
    expect(phpUnserialize(raw)).toEqual({
      address: "test1",
      lat: 39.5,
      lng: -75.5,
    });
  });

  it("decodes a gallery-style sequential array", () => {
    const raw = 'a:3:{i:0;s:3:"256";i:1;s:3:"251";i:2;s:3:"252";}';
    expect(phpUnserialize(raw)).toEqual(["256", "251", "252"]);
  });
});
