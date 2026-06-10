import { describe, expect, it } from "vitest";

import { obstacleType } from "@/db/schema";

import { obstacleForSlug, obstacleSlug, obstacleLabel } from "./labels";

describe("obstacleSlug", () => {
  it("returns the snake_case enum with underscores replaced by hyphens", () => {
    expect(obstacleSlug("quarter_pipe")).toBe("quarter-pipe");
    expect(obstacleSlug("grind_box_ledge")).toBe("grind-box-ledge");
    expect(obstacleSlug("euro_london_gap")).toBe("euro-london-gap");
    expect(obstacleSlug("hubba")).toBe("hubba"); // no underscores
  });

  it("round-trips with obstacleForSlug for all 38 enum values (matches WP)", () => {
    for (const enumValue of obstacleType.enumValues) {
      const slug = obstacleSlug(enumValue);
      expect(obstacleForSlug(slug)).toBe(enumValue);
    }
  });

  it("matches the migration script's inverse (verified at transform.ts:331)", () => {
    // The WP migration parser does slug.replace(/-/g, "_") to get the enum
    // value. Our obstacleSlug must be the exact inverse so 301s from WP
    // /park_obstacles/<slug>/ → /obstacle/<slug> land on existing data.
    for (const enumValue of obstacleType.enumValues) {
      const slug = obstacleSlug(enumValue);
      const reversed = slug.replace(/-/g, "_");
      expect(reversed).toBe(enumValue);
    }
  });
});

describe("obstacleForSlug", () => {
  it("returns the enum value for every known WP slug", () => {
    expect(obstacleForSlug("quarter-pipe")).toBe("quarter_pipe");
    expect(obstacleForSlug("grind-box-ledge")).toBe("grind_box_ledge");
    expect(obstacleForSlug("pump-track")).toBe("pump_track");
    expect(obstacleForSlug("hubba")).toBe("hubba");
  });

  it("returns undefined for unknown slugs (CMT-1A + 2A-cq — type-honest)", () => {
    expect(obstacleForSlug("foo")).toBeUndefined();
    expect(obstacleForSlug("foo-bar")).toBeUndefined();
    expect(obstacleForSlug("")).toBeUndefined();
  });

  it("rejects the underscore form (URLs use hyphens, enum is internal)", () => {
    // Someone might try /obstacle/quarter_pipe expecting it to work; it
    // should not — URL slug shape is normative.
    expect(obstacleForSlug("quarter_pipe")).toBeUndefined();
  });

  it("returns undefined for a malformed slug that .replace alone would silently cast", () => {
    // The unsafe cast pattern `slug.replace(/-/g, "_") as ObstacleType` would
    // happily return "foo_bar" as a "valid" enum value. The Set lookup catches
    // this — verifying CMT-1A's reason for choosing validated lookup.
    expect(obstacleForSlug("foo-bar")).toBeUndefined();
    expect(obstacleForSlug("a-b-c-d")).toBeUndefined();
  });

  it("covers all 38 obstacles (parity with the obstacleLabel record)", () => {
    const labelKeys = Object.keys(obstacleLabel).sort();
    expect(labelKeys).toHaveLength(38);
    for (const key of labelKeys) {
      const slug = obstacleSlug(key as keyof typeof obstacleLabel);
      expect(obstacleForSlug(slug)).toBe(key);
    }
  });
});
