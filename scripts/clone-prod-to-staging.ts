/**
 * Copy park CONTENT (tables + photos) from production into staging, so
 * previews, local dev, and AI agents see realistic data without touching prod.
 *
 * Source: .env.production.local — opened READ-ONLY (default_transaction_read_only).
 * Target: .env.local — must NOT be the production project (hard guard below).
 *
 * Deliberately NOT copied — personal data stays in production only:
 *   auth.users, profiles, suggestions
 *
 * Re-runnable: target content tables are truncated first. Schema must already
 * exist on staging (`pnpm db:migrate`).
 *
 * Run:
 *   pnpm db:clone-to-staging               # tables + photos
 *   pnpm db:clone-to-staging --skip-photos # tables only
 */

import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

const PROD_REF = "djhuxetdljryleztkdrp";
const BUCKET = "photos";
const SKIP_PHOTOS = process.argv.includes("--skip-photos");
const PHOTO_CONCURRENCY = 8;

// FK order: parents before children.
const CONTENT_TABLES = [
  "builders",
  "shops",
  "parks",
  "park_amenities",
  "park_builders",
  "park_links",
  "park_obstacles",
  "park_photos",
  "park_renovations",
  "park_riding_surfaces",
];

type Env = { DIRECT_URL: string; NEXT_PUBLIC_SUPABASE_URL: string; SUPABASE_SECRET_KEY: string };

function loadEnv(file: string): Env {
  const parsed = loadDotenv({ path: file, processEnv: {}, quiet: true }).parsed;
  if (!parsed) {
    console.error(`ERROR: could not read ${file}`);
    process.exit(1);
  }
  for (const key of ["DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
    if (!parsed[key] || parsed[key].includes("[YOUR-")) {
      console.error(`ERROR: ${key} is missing in ${file}`);
      process.exit(1);
    }
  }
  return parsed as Env;
}

async function copyTables(prod: postgres.Sql, staging: postgres.Sql) {
  // One transaction on staging: either the whole copy lands or none of it.
  await staging.begin(async (tx) => {
    await tx.unsafe(`TRUNCATE ${CONTENT_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of CONTENT_TABLES) {
      // json_agg / json_populate_recordset round-trips every column type
      // (enums, arrays, jsonb, timestamps) exactly, matched by column name.
      const [result] = await prod.unsafe<{ rows: unknown[] | null }[]>(
        `SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM public.${table} t`,
      );
      const data = result?.rows ?? [];
      if (data.length > 0) {
        await tx.unsafe(
          `INSERT INTO public.${table} OVERRIDING SYSTEM VALUE
           SELECT * FROM json_populate_recordset(null::public.${table}, $1::text::json)`,
          [JSON.stringify(data)],
        );
      }
      console.log(`  ✓ ${table}: ${data.length} rows`);
    }

    // Bump id sequences past the copied rows so new inserts don't collide.
    const seqs = await tx<{ tbl: string; col: string }[]>`
      SELECT c.table_name AS tbl, c.column_name AS col
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name IN ${tx(CONTENT_TABLES)}
        AND pg_get_serial_sequence('public.' || c.table_name, c.column_name) IS NOT NULL`;
    for (const { tbl, col } of seqs) {
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('public.${tbl}', '${col}'),
                       coalesce((SELECT max(${col}) FROM public.${tbl}), 0) + 1, false)`,
      );
    }
  });
}

async function copyPhotos(prod: postgres.Sql, prodEnv: Env, stagingEnv: Env) {
  const objects = await prod<{ name: string; mimetype: string | null }[]>`
    SELECT name, metadata->>'mimetype' AS mimetype
    FROM storage.objects WHERE bucket_id = ${BUCKET} ORDER BY name`;

  const auth = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` });
  const objectUrl = (base: string, name: string) =>
    `${base}/storage/v1/object/${BUCKET}/${name.split("/").map(encodeURIComponent).join("/")}`;

  let done = 0;
  const failures: string[] = [];
  const queue = [...objects];

  async function worker() {
    for (let obj = queue.shift(); obj; obj = queue.shift()) {
      try {
        const res = await fetch(objectUrl(prodEnv.NEXT_PUBLIC_SUPABASE_URL, obj.name), {
          headers: auth(prodEnv.SUPABASE_SECRET_KEY),
        });
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        const up = await fetch(objectUrl(stagingEnv.NEXT_PUBLIC_SUPABASE_URL, obj.name), {
          method: "POST",
          headers: {
            ...auth(stagingEnv.SUPABASE_SECRET_KEY),
            "Content-Type": obj.mimetype ?? "application/octet-stream",
            "x-upsert": "true",
          },
          body,
        });
        if (!up.ok) throw new Error(`upload HTTP ${up.status}: ${await up.text()}`);
      } catch (err) {
        failures.push(`${obj.name} — ${(err as Error).message}`);
      }
      done++;
      if (done % 250 === 0 || done === objects.length) {
        console.log(`  … ${done}/${objects.length} photos`);
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, worker));

  if (failures.length > 0) {
    console.error(`  ✗ ${failures.length} photo(s) failed:`);
    for (const f of failures.slice(0, 20)) console.error(`    ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${objects.length} photos copied`);
  }
}

async function main() {
  const prodEnv = loadEnv(".env.production.local");
  const stagingEnv = loadEnv(".env.local");

  // Hard guard: never write to production.
  for (const value of [stagingEnv.DIRECT_URL, stagingEnv.NEXT_PUBLIC_SUPABASE_URL]) {
    if (value.includes(PROD_REF)) {
      console.error("ABORT: .env.local points at PRODUCTION. Staging must be a different project.");
      process.exit(1);
    }
  }
  if (!prodEnv.DIRECT_URL.includes(PROD_REF)) {
    console.error("ABORT: .env.production.local does not point at the production project.");
    process.exit(1);
  }

  const prod = postgres(prodEnv.DIRECT_URL, {
    max: 1,
    connection: { default_transaction_read_only: true },
  });
  const staging = postgres(stagingEnv.DIRECT_URL, { max: 1, onnotice: () => {} });

  try {
    console.log("→ Copying tables (prod read-only → staging)…");
    await copyTables(prod, staging);
    if (SKIP_PHOTOS) {
      console.log("→ Skipping photos (--skip-photos)");
    } else {
      console.log(`→ Copying photos (${BUCKET} bucket)…`);
      await copyPhotos(prod, prodEnv, stagingEnv);
    }
    console.log("✓ Done. Not copied by design: auth.users, profiles, suggestions.");
  } finally {
    await prod.end();
    await staging.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
