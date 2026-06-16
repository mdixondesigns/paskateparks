import { describe, expect, it, vi } from "vitest";

import { parks } from "@/db/schema";

import {
  onlyLastRevalidatedAtChanged,
  resolvePaths,
  type ResolverDb,
  type WebhookPayload,
} from "./revalidate-resolver";

// Test fixture builder. The resolver makes one or two DB calls:
//
//   1. db.select({slug, county}).from(parks).where(eq(parks.id, X)).limit(1)
//   2. db.select({obstacle}).from(parkObstacles).where(eq(parkObstacles.parkId, X))
//
// We don't care about the where condition or what columns were selected —
// we just need .from(parks) to return the canned park row (if any), and
// .from(parkObstacles) to return the canned obstacle list. The chain ends
// with either a thenable (no .limit) or .limit() (parks lookup).
function fakeDb(opts: {
  park?: { slug: string; county: string | null } | null;
  obstacles?: string[];
}): ResolverDb {
  const obstacleRows = (opts.obstacles ?? []).map((obstacle) => ({ obstacle }));
  const parkRows = opts.park ? [opts.park] : [];

  // Make a thenable that's awaitable as a Promise AND has a .limit() method.
  function makeResult<T>(rows: T[]) {
    return Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    });
  }

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() =>
          table === parks ? makeResult(parkRows) : makeResult(obstacleRows),
        ),
      })),
    })),
  } as unknown as ResolverDb;
}

const noDb = fakeDb({});

describe("resolvePaths — unknown table", () => {
  it("returns [] paths + warning when table isn't in the known set", () => {
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "park_garbage",
      record: { id: 1 },
    };
    return resolvePaths(payload, noDb).then((result) => {
      expect(result.paths).toEqual([]);
      expect(result.parkIdForTimestamp).toBeNull();
      expect(result.warnings).toContainEqual(expect.stringContaining("unknown table"));
    });
  });
});

describe("resolvePaths — parks INSERT", () => {
  it("revalidates /park, /county, /, /map for a fully-populated new park", async () => {
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "parks",
      record: { id: 42, slug: "new-park", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).toEqual(
      expect.arrayContaining(["/park/new-park", "/county/bucks", "/", "/map"]),
    );
    expect(result.parkIdForTimestamp).toBe(42);
  });

  it("skips /county when county is null", async () => {
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "parks",
      record: { id: 42, slug: "new-park", county: null, status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).not.toContain("/county/null");
    expect(result.paths).toEqual(expect.arrayContaining(["/park/new-park", "/", "/map"]));
  });

  it("warns + skips /county when county is unknown (orphan)", async () => {
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "parks",
      record: { id: 42, slug: "x", county: "MadeUpCounty", status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths.some((p) => p.startsWith("/county"))).toBe(false);
    expect(result.warnings.join("\n")).toMatch(/MadeUpCounty/);
  });
});

describe("resolvePaths — parks UPDATE", () => {
  it("revalidates BOTH old and new slug on slug change", async () => {
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: { id: 1, slug: "new-slug", county: "Bucks", status: "open" },
      old_record: { id: 1, slug: "old-slug", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).toEqual(
      expect.arrayContaining(["/park/new-slug", "/park/old-slug"]),
    );
  });

  it("revalidates BOTH old and new county on county change", async () => {
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: { id: 1, slug: "x", county: "Bucks", status: "open" },
      old_record: { id: 1, slug: "x", county: "Philadelphia", status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).toEqual(
      expect.arrayContaining(["/county/bucks", "/county/philadelphia"]),
    );
  });

  it("fans out to /obstacle for every tagged obstacle on a status flip", async () => {
    const db = fakeDb({ obstacles: ["quarter_pipe", "flat_rail"] });
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: { id: 1, slug: "x", county: "Bucks", status: "permanently_closed" },
      old_record: { id: 1, slug: "x", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "/obstacle/quarter-pipe",
        "/obstacle/flat-rail",
        "/",
        "/map",
      ]),
    );
  });

  it("does NOT fan out to /obstacle when status is unchanged", async () => {
    const db = fakeDb({ obstacles: ["quarter_pipe"] });
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: { id: 1, slug: "x", county: "Bucks", status: "open" },
      old_record: { id: 1, slug: "x", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths.some((p) => p.startsWith("/obstacle"))).toBe(false);
  });
});

describe("resolvePaths — parks DELETE", () => {
  it("revalidates /park/<old.slug>, /county/<old>, /, /map", async () => {
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "parks",
      old_record: {
        id: 7,
        slug: "deleted-park",
        county: "Lancaster",
        status: "open",
      },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "/park/deleted-park",
        "/county/lancaster",
        "/",
        "/map",
      ]),
    );
  });

  it("does NOT fan out to /obstacle (handled by park_obstacles cascade webhooks)", async () => {
    const db = fakeDb({ obstacles: ["quarter_pipe"] });
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "parks",
      old_record: { id: 7, slug: "x", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths.some((p) => p.startsWith("/obstacle"))).toBe(false);
  });

  it("sets parkIdForTimestamp to null because parent is gone", async () => {
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "parks",
      old_record: { id: 7, slug: "x", county: "Bucks", status: "open" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.parkIdForTimestamp).toBeNull();
  });
});

describe("resolvePaths — park_obstacles", () => {
  it("INSERT revalidates /park/<resolved> and /obstacle/<new>", async () => {
    const db = fakeDb({ park: { slug: "fdr", county: "Philadelphia" } });
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "park_obstacles",
      record: { park_id: 13, obstacle: "pool_bowl" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toContain("/park/fdr");
    expect(result.paths).toContain("/obstacle/pool-bowl");
  });

  it("DELETE revalidates /park/<resolved> and /obstacle/<old>", async () => {
    const db = fakeDb({ park: { slug: "fdr", county: "Philadelphia" } });
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "park_obstacles",
      old_record: { park_id: 13, obstacle: "pool_bowl" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toContain("/park/fdr");
    expect(result.paths).toContain("/obstacle/pool-bowl");
  });

  it("DELETE handles park already cascade-deleted (no /park path, no warning)", async () => {
    const db = fakeDb({ park: null });
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "park_obstacles",
      old_record: { park_id: 999, obstacle: "quarter_pipe" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths.some((p) => p.startsWith("/park/"))).toBe(false);
    expect(result.paths).toContain("/obstacle/quarter-pipe");
    expect(result.parkIdForTimestamp).toBeNull();
  });
});

describe("resolvePaths — park_photos (3-surface fanout)", () => {
  it("revalidates /park, /county, /obstacle·N, / on a photo change", async () => {
    const db = fakeDb({
      park: { slug: "fdr", county: "Philadelphia" },
      obstacles: ["pool_bowl", "hubba"],
    });
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "park_photos",
      record: { id: 100, park_id: 13, storage_path: "parks/fdr/photo-01" },
      old_record: { id: 100, park_id: 13, storage_path: "parks/fdr/photo-99" },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "/park/fdr",
        "/",
        "/county/philadelphia",
        "/obstacle/pool-bowl",
        "/obstacle/hubba",
      ]),
    );
  });

  it("does NOT revalidate /map (map renders pins, not photos)", async () => {
    const db = fakeDb({
      park: { slug: "fdr", county: "Philadelphia" },
      obstacles: [],
    });
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "park_photos",
      old_record: { id: 100, park_id: 13 },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).not.toContain("/map");
  });
});

describe("resolvePaths — other child tables", () => {
  it("park_links revalidates ONLY /park/<slug>", async () => {
    const db = fakeDb({ park: { slug: "fdr", county: "Philadelphia" } });
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "park_links",
      record: { id: 5, park_id: 13, type: "instagram", url: "https://..." },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(["/park/fdr"]);
  });

  it("park_amenities revalidates ONLY /park/<slug>", async () => {
    const db = fakeDb({ park: { slug: "x", county: "Bucks" } });
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "park_amenities",
      record: { park_id: 1, type: "bathroom", present: true },
      old_record: { park_id: 1, type: "bathroom", present: false },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(["/park/x"]);
  });

  it("park_renovations works via park_id (serial PK FULL-replicated)", async () => {
    const db = fakeDb({ park: { slug: "x", county: "Bucks" } });
    const payload: WebhookPayload = {
      type: "DELETE",
      table: "park_renovations",
      old_record: { id: 7, park_id: 1, year: 2020 },
    };
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(["/park/x"]);
  });
});

describe("resolvePaths — edge cases", () => {
  it("returns paths but no parkIdForTimestamp when lookup misses (park already gone)", async () => {
    const db = fakeDb({ park: null });
    const payload: WebhookPayload = {
      type: "INSERT",
      table: "park_links",
      record: { id: 5, park_id: 999 },
    };
    const result = await resolvePaths(payload, db);
    expect(result.parkIdForTimestamp).toBeNull();
    expect(result.paths).toEqual([]);
  });

  it("handles missing record on INSERT gracefully", async () => {
    const payload: WebhookPayload = { type: "INSERT", table: "parks" };
    const result = await resolvePaths(payload, noDb);
    // No record + no old_record means no slug to revalidate. / and /map still
    // make sense because *something* in parks changed; we add them as a safety net.
    expect(result.paths).toEqual(expect.arrayContaining(["/", "/map"]));
    expect(result.paths.filter((p) => p.startsWith("/park/"))).toEqual([]);
  });
});

// Loop-guard: regression suite for the 2026-06-15 production incident. Without
// these, a parks UPDATE whose only changed column is last_revalidated_at would
// re-enter the resolver, fan out, write last_revalidated_at again — recursive
// at ~1 req/sec until the webhook is disabled. See onlyLastRevalidatedAtChanged
// in revalidate-resolver.ts for the predicate, and the parks UPDATE short-circuit
// at the top of that branch for the wiring.
describe("onlyLastRevalidatedAtChanged predicate", () => {
  it("returns true when only last_revalidated_at differs", () => {
    const oldRow = {
      id: 42,
      slug: "fdr",
      county: "Philadelphia",
      status: "open",
      last_revalidated_at: "2026-06-15T20:00:00Z",
    };
    const newRow = { ...oldRow, last_revalidated_at: "2026-06-15T20:39:07Z" };
    expect(onlyLastRevalidatedAtChanged(oldRow, newRow)).toBe(true);
  });

  it("returns false when last_revalidated_at AND status differ", () => {
    const oldRow = {
      id: 42,
      slug: "fdr",
      county: "Philadelphia",
      status: "open",
      last_revalidated_at: "2026-06-15T20:00:00Z",
    };
    const newRow = { ...oldRow, status: "closed", last_revalidated_at: "2026-06-15T20:39:07Z" };
    expect(onlyLastRevalidatedAtChanged(oldRow, newRow)).toBe(false);
  });

  it("returns false when only a non-timestamp column changed", () => {
    const oldRow = { id: 42, slug: "fdr", status: "open" };
    const newRow = { id: 42, slug: "fdr", status: "closed" };
    expect(onlyLastRevalidatedAtChanged(oldRow, newRow)).toBe(false);
  });

  it("returns false when the rows are identical (no change at all)", () => {
    const row = { id: 42, slug: "fdr", last_revalidated_at: "2026-06-15T20:00:00Z" };
    expect(onlyLastRevalidatedAtChanged(row, { ...row })).toBe(false);
  });

  it("treats numeric-string vs number as equal (Supabase int/bigint serialization)", () => {
    const oldRow = { id: 42, status: "open", last_revalidated_at: "a" };
    const newRow = { id: "42", status: "open", last_revalidated_at: "b" };
    expect(onlyLastRevalidatedAtChanged(oldRow, newRow)).toBe(true);
  });

  it("returns false when a column appears in one row but not the other (real schema diff)", () => {
    const oldRow = { id: 42, last_revalidated_at: "a" };
    const newRow = { id: 42, slug: "fdr", last_revalidated_at: "b" };
    expect(onlyLastRevalidatedAtChanged(oldRow, newRow)).toBe(false);
  });
});

describe("resolvePaths — parks UPDATE loop-guard", () => {
  it("short-circuits when only last_revalidated_at changed", async () => {
    const baseRow = {
      id: 42,
      slug: "fdr",
      county: "Philadelphia",
      status: "open",
    };
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: { ...baseRow, last_revalidated_at: "2026-06-15T20:39:07Z" },
      old_record: { ...baseRow, last_revalidated_at: "2026-06-15T20:00:00Z" },
    };
    const result = await resolvePaths(payload, noDb);
    expect(result.paths).toEqual([]);
    expect(result.parkIdForTimestamp).toBeNull();
    expect(result.warnings).toContainEqual(expect.stringMatching(/loop-guard/));
  });

  it("does NOT short-circuit when status also changed (normal fan-out applies)", async () => {
    const payload: WebhookPayload = {
      type: "UPDATE",
      table: "parks",
      record: {
        id: 42,
        slug: "fdr",
        county: "Philadelphia",
        status: "closed",
        last_revalidated_at: "2026-06-15T20:39:07Z",
      },
      old_record: {
        id: 42,
        slug: "fdr",
        county: "Philadelphia",
        status: "open",
        last_revalidated_at: "2026-06-15T20:00:00Z",
      },
    };
    const db = fakeDb({ obstacles: [] });
    const result = await resolvePaths(payload, db);
    expect(result.paths).toEqual(
      expect.arrayContaining(["/park/fdr", "/county/philadelphia", "/", "/map"]),
    );
    expect(result.parkIdForTimestamp).toBe(42);
  });
});
