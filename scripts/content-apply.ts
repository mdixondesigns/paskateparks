/**
 * Apply content changesets (content/changes/*.json). See docs/ai-workflow.md.
 *
 *   pnpm content:check [files…]          validate only, no database (default: all)
 *   pnpm content:apply <files…>          apply to STAGING (.env.local); re-runnable
 *   pnpm content:apply --production      apply every not-yet-applied changeset to
 *                                        PRODUCTION (.env.production.local), copying
 *                                        photos from staging. Only runs when
 *                                        CONTENT_APPLY_PRODUCTION=yes — set by the
 *                                        approval-gated GitHub workflow.
 *   pnpm content:apply --production --dry-run
 *                                        list what would be applied (read-only)
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

import {
  appliedFilenames,
  applyChangeset,
  copyPhotos,
  ensureTrackingTable,
  isProd,
  loadProjectEnv,
  loadStagingEnv,
  TRACKING_TABLE,
} from "./content/apply";
import { referencedPhotoPaths, validateChangeset, type Changeset } from "./content/changeset";

const CHANGES_DIR = "content/changes";
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const fileArgs = args.filter((a) => !a.startsWith("--"));

function allChangesetFiles(): string[] {
  try {
    return readdirSync(CHANGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(CHANGES_DIR, f));
  } catch {
    return [];
  }
}

/** Loads and validates; exits listing every error if any file is invalid. */
function loadAll(files: string[]): Array<{ name: string; cs: Changeset }> {
  const loaded: Array<{ name: string; cs: Changeset }> = [];
  let failed = false;
  for (const file of files) {
    const name = path.basename(file);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`✗ ${name}: not valid JSON — ${(e as Error).message}`);
      failed = true;
      continue;
    }
    const r = validateChangeset(json);
    if (!r.ok) {
      console.error(`✗ ${name}:`);
      for (const err of r.errors) console.error(`    ${err}`);
      failed = true;
      continue;
    }
    loaded.push({ name, cs: r.changeset });
  }
  if (failed) process.exit(1);
  return loaded;
}

function printReports(name: string, reports: Awaited<ReturnType<typeof applyChangeset>>) {
  console.log(`✓ ${name}`);
  for (const r of reports) console.log(`    ${r.action} ${r.slug}: ${r.changed.join(", ") || "—"}`);
}

async function check() {
  const files = fileArgs.length > 0 ? fileArgs : allChangesetFiles();
  const loaded = loadAll(files);
  console.log(`✓ ${loaded.length} changeset(s) valid`);
}

async function applyToStaging() {
  if (fileArgs.length === 0) {
    console.error(
      "Name the changeset(s) to apply, e.g. pnpm content:apply content/changes/0012-x.json",
    );
    process.exit(1);
  }
  const env = loadStagingEnv();
  const loaded = loadAll(fileArgs);
  const sql = postgres(env.DIRECT_URL, { max: 1, onnotice: () => {} });
  try {
    await ensureTrackingTable(sql);
    for (const { name, cs } of loaded) printReports(name, await applyChangeset(sql, name, cs));
    console.log("Applied to STAGING. Production is untouched.");
  } finally {
    await sql.end();
  }
}

async function applyToProduction(dryRun: boolean) {
  if (!dryRun && process.env.CONTENT_APPLY_PRODUCTION !== "yes") {
    console.error(
      "Refusing: production applies only run from the approval-gated GitHub workflow\n" +
        "(CONTENT_APPLY_PRODUCTION=yes). Use --dry-run to preview.",
    );
    process.exit(1);
  }
  const staging = loadStagingEnv();
  const prod = loadProjectEnv(".env.production.local");
  if (!isProd(prod)) {
    console.error("ABORT: .env.production.local does not point at the production project.");
    process.exit(1);
  }

  const loaded = loadAll(allChangesetFiles());
  const sql = postgres(prod.DIRECT_URL, {
    max: 1,
    onnotice: () => {},
    ...(dryRun ? { connection: { default_transaction_read_only: true } } : {}),
  });
  try {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass(${TRACKING_TABLE}) IS NOT NULL AS exists`;
    const applied = row?.exists ? await appliedFilenames(sql) : new Set<string>();
    const pending = loaded.filter(({ name }) => !applied.has(name));

    if (pending.length === 0) {
      console.log("✓ Production is up to date — nothing to apply.");
      return;
    }
    console.log(`${pending.length} changeset(s) pending for production:`);
    for (const { name, cs } of pending) console.log(`  • ${name} — ${cs.summary}`);
    if (dryRun) {
      console.log("[dry-run] Nothing applied.");
      return;
    }

    await ensureTrackingTable(sql);
    for (const { name, cs } of pending) {
      const photos = referencedPhotoPaths(cs);
      if (photos.length > 0) {
        await copyPhotos(staging, prod, photos);
        console.log(`  copied ${photos.length} photo(s) staging → production`);
      }
      printReports(name, await applyChangeset(sql, name, cs));
    }
    console.log("Applied to PRODUCTION. Supabase webhooks will refresh the affected pages.");
  } finally {
    await sql.end();
  }
}

async function main() {
  if (flags.has("--check")) return check();
  if (flags.has("--production")) return applyToProduction(flags.has("--dry-run"));
  return applyToStaging();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
