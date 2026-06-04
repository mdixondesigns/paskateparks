/**
 * Idempotent migration runner for supabase/migrations/*.sql.
 *
 * Why not `drizzle-kit migrate` directly? Drizzle Kit's `_journal.json` only
 * tracks auto-generated migrations. We have hand-written ones too (RLS policies,
 * future webhook setup, etc) that Drizzle Kit ignores. A simple runner that
 * applies every .sql file in supabase/migrations/ in lex order, tracking
 * applied filenames in a `__paskateparks_migrations` table, handles both styles
 * uniformly per A7.
 *
 * Why not `supabase db push`? Supabase CLI expects `<YYYYMMDDHHmmss>_<name>.sql`
 * filenames; Drizzle Kit emits `<NNNN>_<name>.sql`. Renaming on every generate
 * is fiddly. This runner doesn't care about the filename pattern.
 *
 * Run:
 *   pnpm db:migrate            # applies any unapplied .sql to DATABASE_URL
 *   pnpm db:migrate --dry-run  # lists what would run, applies nothing
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: ".env.local" });

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const TRACKING_TABLE = "__paskateparks_migrations";
const DRY_RUN = process.argv.includes("--dry-run");

function discoverMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort(); // lex order — Drizzle Kit's 0000_, 0001_, etc. + any hand-written ones we add
}

async function main() {
  // Migrations run DDL (CREATE TYPE, ALTER TABLE) which requires session-mode.
  // DIRECT_URL is the session-mode pooler per Supabase's Drizzle/Prisma convention.
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error(
      "ERROR: DIRECT_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
    process.exit(1);
  }
  if (url.includes("[YOUR-")) {
    console.error(
      "ERROR: DIRECT_URL still contains placeholder text like [YOUR-PASSWORD] / [YOUR-PROJECT-REF].\n" +
        "Open .env.local and paste the real values from your Supabase dashboard:\n" +
        "  Connect → ORM tab → switch to Prisma to see both URLs, copy DIRECT_URL into .env.local",
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await sql.unsafe<{ filename: string }[]>(`SELECT filename FROM ${TRACKING_TABLE}`)).map(
        (r) => r.filename,
      ),
    );

    const migrations = discoverMigrations();
    const pending = migrations.filter((m) => !applied.has(m));

    if (pending.length === 0) {
      console.log(`✓ Up to date — ${migrations.length} migration(s), all applied.`);
      return;
    }

    console.log(
      `${DRY_RUN ? "[dry-run] " : ""}Found ${pending.length} pending migration(s):`,
    );
    for (const m of pending) console.log(`  • ${m}`);

    if (DRY_RUN) {
      console.log("\n[dry-run] No changes applied.");
      return;
    }

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const raw = readFileSync(filePath, "utf8");
      // Drizzle Kit splits multi-statement migrations with this exact marker.
      // Hand-written files won't have it and will run as a single batch.
      const statements = raw
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`\n→ Applying ${filename} (${statements.length} statement block${statements.length === 1 ? "" : "s"})…`);
      const t0 = Date.now();

      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx.unsafe(`INSERT INTO ${TRACKING_TABLE} (filename) VALUES ($1)`, [filename]);
      });

      console.log(`  ✓ Applied ${filename} in ${Date.now() - t0}ms`);
    }

    console.log(`\n✓ Done — ${pending.length} migration(s) applied.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
