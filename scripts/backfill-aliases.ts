// One-off: backfill parks.alias from the WP dump for the 48 existing parks.
// WP stored the alias as meta_key='alias' (and a leading-underscore sidecar
// '_alias' that we skip). Phase-5 migration dropped this field; this restores
// it after migration 0006 added the column.
//
// Run: pnpm tsx scripts/backfill-aliases.ts [--dry-run]

import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

import { loadWpContext, flatMetaForPost, publishedPostsOfType } from "./migrate-wp/wp-context";

loadDotenv({ path: ".env.local" });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ctx = loadWpContext("data/wp-export/mysql.sql");
  const wpParks = publishedPostsOfType(ctx, "park");

  // slug → alias from WP
  const wpAliases = new Map<string, string>();
  for (const p of wpParks) {
    const meta = flatMetaForPost(ctx, p.id);
    const alias = meta.get("alias");
    if (alias && alias.trim()) {
      wpAliases.set(p.postName, alias.trim());
    }
  }

  console.log(`WP parks with alias: ${wpAliases.size} / ${wpParks.length}`);
  if (wpAliases.size === 0) {
    console.log("(nothing to backfill)");
    return;
  }

  const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
  try {
    const dbParks = await sql<{ slug: string }[]>`SELECT slug FROM parks`;
    const dbSlugs = new Set(dbParks.map((p) => p.slug));

    let applied = 0;
    let skipped = 0;
    for (const [wpSlug, alias] of wpAliases) {
      if (!dbSlugs.has(wpSlug)) {
        skipped++;
        console.log(`  skip: WP slug "${wpSlug}" not in DB`);
        continue;
      }
      if (dryRun) {
        console.log(`  would set: ${wpSlug} → "${alias}"`);
      } else {
        await sql`UPDATE parks SET alias = ${alias} WHERE slug = ${wpSlug}`;
        console.log(`  ✓ ${wpSlug} → "${alias}"`);
      }
      applied++;
    }

    console.log(`\n${dryRun ? "WOULD APPLY" : "APPLIED"}: ${applied}  SKIPPED: ${skipped}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
