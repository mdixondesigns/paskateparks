import { describe, expect, it } from "vitest";

import {
  COUNTIES,
  assertCountiesInData,
  countyForSlug,
  slugForCounty,
} from "./counties";

describe("COUNTIES", () => {
  it("contains 14 entries (matches phase 5 distinct parks.county data)", () => {
    expect(COUNTIES).toHaveLength(14);
  });

  it("every slug is unique", () => {
    const slugs = new Set(COUNTIES.map((c) => c.slug));
    expect(slugs.size).toBe(COUNTIES.length);
  });

  it("every displayName is unique", () => {
    const names = new Set(COUNTIES.map((c) => c.displayName));
    expect(names.size).toBe(COUNTIES.length);
  });

  it("every slug matches displayName.toLowerCase() (current PA data)", () => {
    for (const c of COUNTIES) {
      expect(c.slug).toBe(c.displayName.toLowerCase());
    }
  });
});

describe("countyForSlug", () => {
  it("returns the county for every known slug", () => {
    for (const c of COUNTIES) {
      expect(countyForSlug(c.slug)).toEqual(c);
    }
  });

  it("returns undefined for unknown slug (codex #1 symmetry with obstacleForSlug)", () => {
    expect(countyForSlug("foo")).toBeUndefined();
    expect(countyForSlug("")).toBeUndefined();
  });

  it("is case-sensitive on the URL slug (slugs are lowercase by convention)", () => {
    expect(countyForSlug("Allegheny")).toBeUndefined();
    expect(countyForSlug("BUCKS")).toBeUndefined();
  });
});

describe("slugForCounty", () => {
  it("returns slug for each known display name", () => {
    for (const c of COUNTIES) {
      expect(slugForCounty(c.displayName)).toBe(c.slug);
    }
  });

  it("is case + whitespace tolerant (Studio entries vary)", () => {
    expect(slugForCounty("bucks")).toBe("bucks");
    expect(slugForCounty("BUCKS")).toBe("bucks");
    expect(slugForCounty("  Bucks  ")).toBe("bucks");
  });

  it("returns undefined for unknown display name", () => {
    expect(slugForCounty("Lebanon")).toBeUndefined();
    expect(slugForCounty("")).toBeUndefined();
  });
});

describe("assertCountiesInData (build-time sanity check)", () => {
  it("passes when every county matches the map", () => {
    expect(() =>
      assertCountiesInData(["Bucks", "Philadelphia", "Allegheny"]),
    ).not.toThrow();
  });

  it("ignores null and empty values (stub parks have null county)", () => {
    expect(() =>
      assertCountiesInData([null, "Bucks", "", "  ", undefined]),
    ).not.toThrow();
  });

  it("tolerates case + whitespace differences", () => {
    expect(() =>
      assertCountiesInData(["bucks", "  PHILADELPHIA  ", "york"]),
    ).not.toThrow();
  });

  it("throws when any value is not in the map", () => {
    expect(() => assertCountiesInData(["Bucks", "Lebanon"])).toThrow(
      /Lebanon/,
    );
  });

  it("reports the count of distinct unknowns", () => {
    expect(() =>
      assertCountiesInData(["Bucks", "Lebanon", "Lebanon", "Schuylkill"]),
    ).toThrow(/2 parks\.county value/);
  });

  it("includes every distinct unknown value in the error", () => {
    let caught: unknown;
    try {
      assertCountiesInData(["Bucks", "Lebanon", "Schuylkill", "Erie"]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toContain("Erie");
    expect(msg).toContain("Lebanon");
    expect(msg).toContain("Schuylkill");
  });

  it("does NOT report a county twice when it appears multiple times", () => {
    let msg = "";
    try {
      assertCountiesInData(["Lebanon", "Lebanon", "Lebanon"]);
    } catch (e) {
      msg = (e as Error).message;
    }
    // Should say "1 parks.county value" not "3"
    expect(msg).toMatch(/1 parks\.county value/);
  });
});
