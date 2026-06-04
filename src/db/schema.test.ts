/**
 * Schema integrity smoke test. Catches "I deleted a table by accident" regressions
 * when the schema changes. Not a substitute for end-to-end DB tests (those land
 * in phase 3+ once we can hit the real DB).
 */

import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("Drizzle schema — exports match STACK-PIVOT.md §Final schema", () => {
  it("exports all 11 tables", () => {
    const expectedTables = [
      "parks",
      "parkRenovations",
      "parkRidingSurfaces",
      "parkObstacles",
      "parkAmenities",
      "parkLinks",
      "builders",
      "parkBuilders",
      "shops",
      "parkPhotos",
      "suggestions",
    ];
    for (const name of expectedTables) {
      expect(schema, `missing table export: ${name}`).toHaveProperty(name);
    }
  });

  it("exports all 7 enums", () => {
    const expectedEnums = [
      "parkStatus",
      "parkType",
      "helmetsPolicy",
      "ridingSurface",
      "linkType",
      "amenityType",
      "obstacleType",
    ];
    for (const name of expectedEnums) {
      expect(schema, `missing enum export: ${name}`).toHaveProperty(name);
    }
  });

  it("obstacleType has all 38 obstacles from WP taxonomy", () => {
    // Source: SITE-AUDIT.md §4 — 38 obstacles with per-park counts.
    expect(schema.obstacleType.enumValues).toHaveLength(38);
  });

  it("amenityType has the 7 amenities from D18 / E4", () => {
    expect(schema.amenityType.enumValues).toEqual([
      "bathroom",
      "drinking_water",
      "lights",
      "parking",
      "spectator_area",
      "onsite_shop",
      "equipment_rentals",
    ]);
  });

  it("linkType has all 12 platform types + 'other' fallback", () => {
    // 6 connect + 6 support per D21/D23, plus 'other' for unrecognized links.
    expect(schema.linkType.enumValues).toContain("website");
    expect(schema.linkType.enumValues).toContain("instagram");
    expect(schema.linkType.enumValues).toContain("gofundme");
    expect(schema.linkType.enumValues).toContain("other");
    expect(schema.linkType.enumValues).toHaveLength(13);
  });

  it("parkStatus reflects D11 status surfacing", () => {
    expect(schema.parkStatus.enumValues).toEqual([
      "open",
      "temporarily_closed",
      "permanently_closed",
    ]);
  });
});
