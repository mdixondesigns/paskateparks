import "server-only";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { dbPooled } from "@/db/pooled";
import { parks } from "@/db/schema";
import { appEnv } from "@/lib/env";
import { resolvePaths, type WebhookPayload } from "@/lib/revalidate-resolver";

// PIN runtime to Node (CMT-1, outside voice). The bearer comparison uses
// node:crypto.timingSafeEqual, which doesn't exist on the Edge runtime — if
// Next.js ever defaulted this route to Edge the import would crash. Explicit
// is safer than implicit for the most security-sensitive route in the app.
export const runtime = "nodejs";

// Disable Next's built-in body parsing — we read the raw text ourselves so
// the auth check + JSON parse failures are explicit.
export const dynamic = "force-dynamic";

const BEARER_PREFIX = "Bearer ";
const expectedSecret = Buffer.from(appEnv.REVALIDATE_SECRET, "utf8");

/**
 * Supabase Database Webhook receiver.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Supabase Webhook (AFTER trigger, per row, on 8 tables)      │
 *   │           │ POST /api/revalidate                              │
 *   │           │ Authorization: Bearer <REVALIDATE_SECRET>         │
 *   │           ▼                                                   │
 *   │  1. timingSafeEqual on the bearer → 401 on mismatch          │
 *   │  2. JSON.parse body → 400 on malformed                       │
 *   │  3. resolvePaths(payload, dbPooled) → string[]               │
 *   │  4. Promise.all(paths.map(revalidatePath +.catch(logFail)))  │
 *   │  5. UPDATE parks SET last_revalidated_at = now() WHERE id=$1 │
 *   │  6. 200 OK with summary JSON                                 │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Phase 9 write-amp deferral (10A): the timestamp UPDATE fires on every
 * relevant webhook, even though a bulk Studio edit can cascade ~8 writes
 * per park. TODOS.md P2 captures the GREATEST(now,col) mitigation for v1.1.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // 1. Bearer auth — constant-time compare to defeat byte-by-byte guessing.
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(BEARER_PREFIX)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const presented = Buffer.from(header.slice(BEARER_PREFIX.length), "utf8");
  if (
    presented.length !== expectedSecret.length ||
    !timingSafeEqual(presented, expectedSecret)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse body. Supabase sends JSON.
  let payload: WebhookPayload;
  try {
    const text = await request.text();
    payload = JSON.parse(text) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "malformed_json" }, { status: 400 });
  }
  if (!payload?.type || !payload?.table) {
    return NextResponse.json({ error: "missing_envelope_fields" }, { status: 400 });
  }

  // 3. Resolve the affected paths.
  const result = await resolvePaths(payload, dbPooled);

  // Surface resolver warnings (orphan county, unknown table) to Vercel logs.
  for (const warning of result.warnings) {
    console.warn(`[revalidate] ${payload.table}/${payload.type}: ${warning}`);
  }

  // 4. Fan out revalidations in parallel. Each path is independent — Next's
  // cache invalidation is internal bookkeeping, no DB cost per call. Wrap
  // each in catch so one bad path doesn't drop the others (CMT-10 outside voice).
  const revalidations = await Promise.all(
    result.paths.map(async (path) => {
      try {
        revalidatePath(path);
        return { path, ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[revalidate] failed for ${path}: ${message}`);
        return { path, ok: false as const, error: message };
      }
    }),
  );

  // 5. D18 observability — bump last_revalidated_at on the affected park.
  if (result.parkIdForTimestamp != null) {
    try {
      await dbPooled
        .update(parks)
        .set({ lastRevalidatedAt: new Date() })
        .where(eq(parks.id, result.parkIdForTimestamp));
    } catch (err) {
      // Non-fatal: revalidation already happened, this is just observability.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[revalidate] last_revalidated_at update failed for park ${result.parkIdForTimestamp}: ${message}`,
      );
    }
  }

  return NextResponse.json({
    table: payload.table,
    type: payload.type,
    revalidated: revalidations,
    warnings: result.warnings,
  });
}
