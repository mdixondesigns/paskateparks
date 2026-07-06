import { describe, expect, it } from "vitest";

import { filterByBbox, inBbox, type LatLngBoundsLike } from "./bbox-filter";

// A box covering rough Lehigh Valley area — used as the canonical "bounds" in
// tests. Center ~40.6, -75.5. Parks inside vs outside are picked to be on
// opposite sides of the box edges with comfortable margin.
const VALLEY: LatLngBoundsLike = { south: 40.4, west: -75.8, north: 40.8, east: -75.2 };

describe("inBbox — single-park predicate", () => {
  it("returns true for a park inside the bounds", () => {
    expect(inBbox({ lat: 40.6, lng: -75.5 }, VALLEY)).toBe(true);
  });

  it("returns true for a park exactly on an edge (inclusive)", () => {
    expect(inBbox({ lat: 40.4, lng: -75.5 }, VALLEY)).toBe(true); // south edge
    expect(inBbox({ lat: 40.8, lng: -75.5 }, VALLEY)).toBe(true); // north edge
    expect(inBbox({ lat: 40.6, lng: -75.8 }, VALLEY)).toBe(true); // west edge
    expect(inBbox({ lat: 40.6, lng: -75.2 }, VALLEY)).toBe(true); // east edge
  });

  it("returns false for a park outside any single edge", () => {
    expect(inBbox({ lat: 39.9, lng: -75.5 }, VALLEY)).toBe(false); // too south
    expect(inBbox({ lat: 41.0, lng: -75.5 }, VALLEY)).toBe(false); // too north
    expect(inBbox({ lat: 40.6, lng: -76.0 }, VALLEY)).toBe(false); // too west
    expect(inBbox({ lat: 40.6, lng: -75.0 }, VALLEY)).toBe(false); // too east
  });

  it("returns false for null lat or lng (parks with no coords)", () => {
    expect(inBbox({ lat: null, lng: -75.5 }, VALLEY)).toBe(false);
    expect(inBbox({ lat: 40.6, lng: null }, VALLEY)).toBe(false);
    expect(inBbox({ lat: null, lng: null }, VALLEY)).toBe(false);
  });

  it("returns false for NaN/Infinity park coords (defense-in-depth)", () => {
    expect(inBbox({ lat: Number.NaN, lng: -75.5 }, VALLEY)).toBe(false);
    expect(inBbox({ lat: 40.6, lng: Number.POSITIVE_INFINITY }, VALLEY)).toBe(false);
  });

  it("returns false when bounds themselves are malformed", () => {
    const bad: LatLngBoundsLike = { south: Number.NaN, west: -75.8, north: 40.8, east: -75.2 };
    expect(inBbox({ lat: 40.6, lng: -75.5 }, bad)).toBe(false);
  });
});

describe("filterByBbox — list filtering", () => {
  const parks = [
    { id: 1, name: "Inside center", lat: 40.6, lng: -75.5 },
    { id: 2, name: "Inside edge", lat: 40.4, lng: -75.5 },
    { id: 3, name: "Outside north", lat: 41.5, lng: -75.5 },
    { id: 4, name: "Outside west", lat: 40.6, lng: -78.0 },
    { id: 5, name: "Stub no coords", lat: null, lng: null },
  ];

  it("returns only parks inside the bounds, preserving order", () => {
    const r = filterByBbox(parks, VALLEY);
    expect(r.map((p) => p.id)).toEqual([1, 2]);
  });

  it("returns empty array when no parks fall inside (degenerate/all-outside bbox)", () => {
    const noneInside: LatLngBoundsLike = { south: 30, west: -100, north: 31, east: -99 };
    expect(filterByBbox(parks, noneInside)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterByBbox([], VALLEY)).toEqual([]);
  });

  it("preserves extra fields on the input shape (generic narrowing)", () => {
    const r = filterByBbox(parks, VALLEY);
    expect(r[0]?.name).toBe("Inside center"); // extra fields survive .filter()
  });

  it("excludes parks with null coords without throwing", () => {
    const r = filterByBbox(parks, VALLEY);
    expect(r.find((p) => p.id === 5)).toBeUndefined();
  });
});
