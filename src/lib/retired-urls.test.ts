import { describe, expect, it } from "vitest";

import {
  RETIRED_BUILDER_SLUGS,
  RETIRED_SHOP_SLUGS,
  isRetiredBuilderOrShopPath,
} from "./retired-urls";

describe("RETIRED_BUILDER_SLUGS", () => {
  it("contains 14 builder slugs (matches SITE-AUDIT.md §5 count)", () => {
    expect(RETIRED_BUILDER_SLUGS.size).toBe(14);
  });

  it("contains every WP builder example from SITE-AUDIT", () => {
    for (const slug of [
      "spohn-ranch-skateparks",
      "grindline-skateparks",
      "diy",
      "pat-bodor",
      "5th-pocket-skateparks",
      "site-design-group-inc",
      "tom-martyn",
    ]) {
      expect(RETIRED_BUILDER_SLUGS.has(slug), `missing builder: ${slug}`).toBe(true);
    }
  });
});

describe("RETIRED_SHOP_SLUGS", () => {
  it("contains 22 shop slugs (19 published + 3 draft from WP export)", () => {
    expect(RETIRED_SHOP_SLUGS.size).toBe(22);
  });

  it("contains every SITE-AUDIT named example", () => {
    for (const slug of [
      "nocturnal",
      "zembo-temple-of-skate-design",
      "plank-eye-board-shop",
      "radio-skateshop",
      "exist-skate-shop",
    ]) {
      expect(RETIRED_SHOP_SLUGS.has(slug), `missing shop: ${slug}`).toBe(true);
    }
  });
});

describe("no slug appears in both sets", () => {
  it("builder + shop slug sets are disjoint", () => {
    const overlap = [...RETIRED_BUILDER_SLUGS].filter((s) =>
      RETIRED_SHOP_SLUGS.has(s),
    );
    expect(overlap, `unexpected overlap: ${overlap.join(",")}`).toEqual([]);
  });
});

describe("isRetiredBuilderOrShopPath", () => {
  it("matches /builder/<known-slug>", () => {
    expect(isRetiredBuilderOrShopPath("/builder/spohn-ranch-skateparks")).toBe(true);
  });
  it("matches /builder/<known-slug>/ trailing slash", () => {
    expect(isRetiredBuilderOrShopPath("/builder/spohn-ranch-skateparks/")).toBe(true);
  });
  it("matches /builder/<unknown-slug> — entire post type is retired", () => {
    expect(isRetiredBuilderOrShopPath("/builder/some-future-slug")).toBe(true);
  });
  it("matches bare /builder", () => {
    expect(isRetiredBuilderOrShopPath("/builder")).toBe(true);
  });
  it("matches /shop/<known-slug>", () => {
    expect(isRetiredBuilderOrShopPath("/shop/nocturnal")).toBe(true);
  });
  it("matches /shop/ with trailing slash", () => {
    expect(isRetiredBuilderOrShopPath("/shop/")).toBe(true);
  });
  it("does NOT match /park/<slug>", () => {
    expect(isRetiredBuilderOrShopPath("/park/fdr")).toBe(false);
  });
  it("does NOT match /county/<slug>", () => {
    expect(isRetiredBuilderOrShopPath("/county/philadelphia")).toBe(false);
  });
  it("does NOT match /buildery (substring guard)", () => {
    expect(isRetiredBuilderOrShopPath("/buildery")).toBe(false);
  });
  it("ignores query strings", () => {
    expect(isRetiredBuilderOrShopPath("/builder/diy?utm_source=x")).toBe(true);
  });
});
