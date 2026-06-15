import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolvePaths, type ResolverDb, type WebhookPayload } from "./revalidate-resolver";

// Phase 9 T16 — replay REAL captured Supabase webhook payloads through the
// resolver. The hand-built mocks in revalidate-resolver.test.ts cover the
// documented envelope shape; this file covers the ACTUAL shape Supabase ships,
// so if Supabase ever changes the field set, REPLICA IDENTITY semantics, or
// payload encoding, we catch it loudly instead of silently dropping events.
//
// To populate, follow the capture flow in STACK-PIVOT §"Phase 9 Supabase
// Webhooks setup": Studio → trigger row change → Webhooks → Recent deliveries
// → click delivery → copy the Payload JSON into the `payload` field of a new
// entry in `samples` (e2e/fixtures/supabase-webhook-payload.json).
//
// While samples is empty, the suite skips with a directive — the deferred
// state is documented in TODOS.md but visible in test output too.

interface FixtureSample {
  /** Human-readable label, e.g. "UPDATE parks - status open→closed". */
  label: string;
  /** Raw webhook envelope as posted by Supabase. */
  payload: WebhookPayload;
}

interface Fixture {
  _comment?: string;
  samples: FixtureSample[];
}

const FIXTURE_PATH = resolve(__dirname, "../../e2e/fixtures/supabase-webhook-payload.json");

const KNOWN_TABLES = new Set([
  "parks",
  "park_obstacles",
  "park_photos",
  "park_amenities",
  "park_riding_surfaces",
  "park_builders",
  "park_renovations",
  "park_links",
]);

// Permissive fakeDb: returns empty rows for any select. The fixture tests
// don't validate routing logic (the hand-built suite already does); they
// validate that the envelope deserializes + the resolver doesn't throw.
function permissiveDb(): ResolverDb {
  function makeResult<T>(rows: T[]) {
    return Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    });
  }
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => makeResult([])),
      })),
    })),
  } as unknown as ResolverDb;
}

function loadFixture(): Fixture {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as Fixture;
}

const fixture = loadFixture();

describe.skipIf(fixture.samples.length === 0)(
  "resolvePaths — real Supabase webhook fixture (T16)",
  () => {
    for (const sample of fixture.samples) {
      describe(sample.label, () => {
        it("envelope conforms to WebhookPayload shape", () => {
          expect(["INSERT", "UPDATE", "DELETE"]).toContain(sample.payload.type);
          expect(KNOWN_TABLES.has(sample.payload.table)).toBe(true);
          // schema is optional in our type but Supabase always sends it.
          expect(sample.payload.schema).toBeTruthy();
        });

        it("INSERT/UPDATE carries a record; UPDATE/DELETE carries an old_record", () => {
          if (sample.payload.type === "INSERT" || sample.payload.type === "UPDATE") {
            expect(sample.payload.record).toBeTruthy();
            expect(typeof sample.payload.record).toBe("object");
          }
          if (sample.payload.type === "UPDATE" || sample.payload.type === "DELETE") {
            expect(sample.payload.old_record).toBeTruthy();
            expect(typeof sample.payload.old_record).toBe("object");
          }
        });

        it("old_record exposes more than the PK (REPLICA IDENTITY FULL invariant)", () => {
          if (sample.payload.type !== "UPDATE" && sample.payload.type !== "DELETE") {
            return; // INSERT has no old_record.
          }
          const oldRecord = sample.payload.old_record;
          expect(oldRecord).toBeTruthy();
          const keys = Object.keys(oldRecord!);
          // PK-only would be just ["id"]. FULL means we get every column.
          // If this assertion fails, migration 0004_replica_identity_full.sql
          // wasn't applied (or was rolled back) on the table that fired.
          expect(keys.length).toBeGreaterThan(1);
        });

        it("resolver accepts the payload without throwing", async () => {
          // Doesn't assert routing — just confirms the resolver's payload
          // narrowing logic accepts the real envelope shape end-to-end.
          await expect(resolvePaths(sample.payload, permissiveDb())).resolves.toMatchObject({
            paths: expect.any(Array),
          });
        });
      });
    }
  },
);

