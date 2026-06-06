/**
 * Phase 5 — WP → Supabase migration orchestrator.
 *
 * Composes the four building blocks:
 *   1. wp-context.ts   — read + index the mysqldump
 *   2. transform.ts    — context → typed payloads
 *   3. photos.ts       — Sharp-resize + Storage upload (idempotent via existence-check)
 *   4. insert.ts       — Drizzle inserts with per-park transaction (idempotent via wp_post_id)
 *
 * Run modes:
 *   pnpm migrate-wp                 # full run
 *   pnpm migrate-wp:dry-run         # transform-only; print summary, write nothing
 *   pnpm migrate-wp --park <slug>   # single park (debugging)
 *   pnpm migrate-wp --photos-only   # skip DB inserts (re-upload photos)
 *   pnpm migrate-wp --db-only       # skip photo pipeline (re-do DB inserts)
 *
 * Re-runnable — the whole script is safe to re-run. Photos idempotent via
 * Storage existence check; DB idempotent via wp_post_id ON CONFLICT and
 * DELETE-then-INSERT for child tables per STACK-PIVOT.md finding #9.
 */

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";

import {
  countAllTables,
  insertBuilders,
  insertOnePark,
  insertShops,
} from "./migrate-wp/insert";
import { runPhotoPipeline } from "./migrate-wp/photos";
import {
  buildersFromContext,
  parksFromContext,
  shopsFromContext,
} from "./migrate-wp/transform";
import type { ParkPayload } from "./migrate-wp/types";
import { loadWpContext } from "./migrate-wp/wp-context";

// ─── CLI parsing ────────────────────────────────────────────────────────────

interface Args {
  dryRun: boolean;
  photosOnly: boolean;
  dbOnly: boolean;
  park: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, photosOnly: false, dbOnly: false, park: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--photos-only") args.photosOnly = true;
    else if (a === "--db-only") args.dbOnly = true;
    else if (a === "--park") {
      args.park = argv[++i] ?? null;
      if (!args.park) {
        console.error("ERROR: --park flag requires a slug argument");
        process.exit(1);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: pnpm migrate-wp [flags]

Flags:
  --dry-run      Transform-only. Print summary, write nothing.
  --photos-only  Skip DB inserts. Just re-run the photo pipeline.
  --db-only      Skip photo pipeline. Just re-run DB inserts.
  --park <slug>  Process only this park (debugging).
`);
      process.exit(0);
    }
  }
  if (args.photosOnly && args.dbOnly) {
    console.error("ERROR: --photos-only and --db-only are mutually exclusive");
    process.exit(1);
  }
  return args;
}

// ─── Env validation ─────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.includes("[YOUR-") || v === "") {
    console.error(`ERROR: ${name} is not set or still contains placeholder text.`);
    process.exit(1);
  }
  return v;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dumpPath = resolve(process.cwd(), "data/wp-export/mysql.sql");
  const uploadsRoot = resolve(process.cwd(), "data/wp-export/uploads");

  console.log("┌────────────────────────────────────────────────────────────");
  console.log("│  paskateparks WP → Supabase migration");
  console.log("├────────────────────────────────────────────────────────────");
  console.log(`│  mode:        ${args.dryRun ? "DRY-RUN (no writes)" : "live"}`);
  if (args.photosOnly) console.log("│  scope:       photos only (DB skipped)");
  if (args.dbOnly) console.log("│  scope:       DB only (photo pipeline skipped)");
  if (args.park) console.log(`│  scope:       single park: ${args.park}`);
  console.log(`│  dump:        ${dumpPath}`);
  console.log(`│  uploads:     ${uploadsRoot}`);
  console.log("└────────────────────────────────────────────────────────────");
  console.log();

  // ─── Phase A: load + transform ────────────────────────────────────────────
  const t0 = Date.now();
  console.log("[1/4] Loading WP context from mysqldump…");
  const ctx = loadWpContext(dumpPath);
  console.log(`      ✓ loaded in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  console.log("[2/4] Transforming WP rows → payloads…");
  let parks = parksFromContext(ctx);
  const builders = buildersFromContext(ctx);
  const shops = shopsFromContext(ctx);

  if (args.park) {
    parks = parks.filter((p: ParkPayload) => p.slug === args.park);
    if (parks.length === 0) {
      console.error(`ERROR: no park with slug ${JSON.stringify(args.park)} found`);
      process.exit(1);
    }
  }

  console.log(
    `      ✓ ${parks.length} parks, ${builders.length} builders, ${shops.length} shops in ${Date.now() - t1}ms`,
  );

  if (args.dryRun) {
    console.log();
    console.log("DRY-RUN summary:");
    console.log(`  parks       = ${parks.length}`);
    console.log(`  builders    = ${builders.length}`);
    console.log(`  shops       = ${shops.length}`);
    const totalPhotos = parks.reduce((s, p) => s + p.photos.length, 0);
    console.log(`  park photos = ${totalPhotos} (would upload ${totalPhotos * 3} JPEG files)`);
    console.log();
    console.log("No writes performed. Re-run without --dry-run to apply.");
    return;
  }

  // ─── Phase B: photos ──────────────────────────────────────────────────────
  if (!args.dbOnly) {
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SECRET_KEY");
    console.log();
    console.log("[3/4] Running photo pipeline (Sharp resize + Storage upload)…");
    const tPhotos = Date.now();
    const result = await runPhotoPipeline(parks, {
      uploadsRoot,
      supabaseUrl,
      supabaseSecretKey: supabaseKey,
      onProgress: (p) => {
        if (p.parksDone % 5 === 0 || p.parksDone === p.parksTotal) {
          console.log(`        [${p.parksDone}/${p.parksTotal}] last: ${p.lastSlug}`);
        }
      },
    });
    console.log(`      ✓ photo pipeline done in ${Math.round((Date.now() - tPhotos) / 1000)}s`);
    console.log(`        photos uploaded: ${result.photosUploaded}, skipped: ${result.photosSkipped}`);
    console.log(`        files uploaded:  ${result.filesUploaded}, skipped: ${result.filesSkipped}`);
    if (result.errors.length > 0) {
      console.log(`        ⚠ errors: ${result.errors.length}`);
      for (const e of result.errors.slice(0, 10)) {
        console.log(`          - ${e.parkSlug}#${e.photoSortOrder}: ${e.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`          … (${result.errors.length - 10} more — re-run --photos-only to retry)`);
      }
    }
  } else {
    console.log();
    console.log("[3/4] Photo pipeline skipped (--db-only)");
  }

  // ─── Phase C: DB inserts ──────────────────────────────────────────────────
  if (!args.photosOnly) {
    console.log();
    console.log("[4/4] Writing to Postgres (DIRECT_URL — session-mode pooler)…");
    const dbUrl = requireEnv("DIRECT_URL");
    const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
    const db = drizzle(sql, { schema });

    try {
      const tDb = Date.now();
      // Insert order: builders + shops first (independent), then parks.
      console.log("        inserting builders…");
      const buildersResult = await insertBuilders(db, builders);
      console.log(`          ✓ ${buildersResult.total} builders (name → id map built)`);

      console.log("        inserting shops…");
      const shopsResult = await insertShops(db, shops);
      console.log(
        `          ✓ ${shopsResult.total} shops${shopsResult.skipped > 0 ? `, ${shopsResult.skipped} skipped (no lat/lng)` : ""}`,
      );

      console.log(`        inserting ${parks.length} parks (with child rows in per-park txn)…`);
      let parksInserted = 0;
      let totalChildren = 0;
      const parkErrors: Array<{ slug: string; error: string }> = [];
      for (const p of parks) {
        try {
          const r = await insertOnePark(db, p, buildersResult.byName);
          parksInserted++;
          totalChildren += r.childRowsInserted;
          if (parksInserted % 10 === 0 || parksInserted === parks.length) {
            console.log(`          [${parksInserted}/${parks.length}] last: ${p.slug}`);
          }
        } catch (e) {
          parkErrors.push({
            slug: p.slug,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      console.log(`        ✓ DB inserts done in ${Math.round((Date.now() - tDb) / 1000)}s`);
      console.log(`          parks: ${parksInserted}/${parks.length}, child rows: ${totalChildren}`);
      if (parkErrors.length > 0) {
        console.log(`          ⚠ ${parkErrors.length} park insert errors:`);
        for (const e of parkErrors.slice(0, 10)) {
          console.log(`            - ${e.slug}: ${e.error}`);
        }
      }

      console.log();
      console.log("Final table counts:");
      const counts = await countAllTables(db);
      for (const [table, n] of Object.entries(counts)) {
        console.log(`  ${table.padEnd(25)} ${n}`);
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else {
    console.log();
    console.log("[4/4] DB inserts skipped (--photos-only)");
  }

  console.log();
  console.log(`Total elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log("Done.");
}

main().catch((err) => {
  console.error();
  console.error("MIGRATION FAILED:", err);
  process.exit(1);
});
