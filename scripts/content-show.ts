/**
 * Print a park's current content from STAGING, in changeset shape — the
 * starting point for an edit (lists in a changeset replace, so copy the
 * current list and change it).
 *
 *   pnpm content:show <slug>
 *
 * Read-only. Staging mirrors production via `pnpm db:clone-to-staging`.
 */

import postgres from "postgres";

import { loadStagingEnv } from "./content/apply";
import { PARK_FIELDS } from "./content/changeset";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: pnpm content:show <slug>");
    process.exit(1);
  }
  const env = loadStagingEnv();
  const sql = postgres(env.DIRECT_URL, {
    max: 1,
    connection: { default_transaction_read_only: true },
  });
  try {
    const columns = Object.keys(PARK_FIELDS);
    const [park] = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT id, ${columns.map((c) => (c === "reopen_expected_at" ? `${c}::text` : c)).join(", ")}
       FROM parks WHERE slug = $1`,
      [slug],
    );
    if (!park) {
      console.log(`No park with slug "${slug}" in staging — a changeset would create it.`);
      return;
    }
    const id = park.id as number;
    delete park.id;
    const fields = Object.fromEntries(Object.entries(park).filter(([, v]) => v !== null));

    const obstacles =
      await sql`SELECT obstacle FROM park_obstacles WHERE park_id = ${id} ORDER BY 1`;
    const surfaces =
      await sql`SELECT surface FROM park_riding_surfaces WHERE park_id = ${id} ORDER BY 1`;
    const amenities =
      await sql`SELECT type, present, notes FROM park_amenities WHERE park_id = ${id} ORDER BY 1`;
    const links =
      await sql`SELECT type, url, label FROM park_links WHERE park_id = ${id} ORDER BY sort_order`;
    const photos = await sql`
      SELECT storage_path AS path, alt_text, credit, caption
      FROM park_photos WHERE park_id = ${id} ORDER BY sort_order`;

    console.log(
      JSON.stringify(
        {
          slug,
          fields,
          obstacles: obstacles.map((r) => r.obstacle),
          riding_surfaces: surfaces.map((r) => r.surface),
          amenities: [...amenities],
          links: [...links],
          current_photos: [...photos],
        },
        null,
        2,
      ),
    );
    console.log("\n(current_photos is for reference — changesets only add via photos_add.)");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
