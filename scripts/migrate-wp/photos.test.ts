import { describe, expect, it } from "vitest";

import { storagePathForPhoto } from "./photos";

describe("storagePathForPhoto", () => {
  it("formats with zero-padded sort_order", () => {
    expect(storagePathForPhoto("fdr", 0)).toBe("parks/fdr/photo-00");
    expect(storagePathForPhoto("fdr", 7)).toBe("parks/fdr/photo-07");
    expect(storagePathForPhoto("fdr", 27)).toBe("parks/fdr/photo-27");
  });

  it("preserves the park slug verbatim (no slug munging)", () => {
    expect(storagePathForPhoto("9th-and-poplar", 0)).toBe("parks/9th-and-poplar/photo-00");
    expect(storagePathForPhoto("fdr-test", 12)).toBe("parks/fdr-test/photo-12");
  });

  it("handles ≥100 photos (3-digit sort_order)", () => {
    // No park currently has this many — but the path should still be parseable.
    // We zero-pad to 2; sort_order 100+ overflows to "100", "101", etc.
    // That's fine for ordering and lookup; just don't be surprised in the wild.
    expect(storagePathForPhoto("fdr", 100)).toBe("parks/fdr/photo-100");
  });
});
