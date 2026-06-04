/**
 * One-shot verification that the migration applied correctly. Run with:
 *   pnpm tsx scripts/db-verify.ts
 *
 * Prints: table count, enum count, RLS status, expected vs actual counts.
 */

import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: ".env.local" });

const EXPECTED_TABLES = [
  "parks",
  "park_renovations",
  "park_riding_surfaces",
  "park_obstacles",
  "park_amenities",
  "park_links",
  "builders",
  "park_builders",
  "shops",
  "park_photos",
  "suggestions",
];

const EXPECTED_ENUMS = [
  "park_status",
  "park_type",
  "helmets_policy",
  "riding_surface",
  "link_type",
  "amenity_type",
  "obstacle_type",
];

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error("DIRECT_URL not set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
      const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '\\_\\_%' ESCAPE '\\'
      ORDER BY tablename
    `;
    const enums = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY typname
    `;
    const rls = await sql<{ tablename: string; rls: boolean }[]>`
      SELECT c.relname AS tablename, c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    const obstacleCount = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'obstacle_type'
    `;

    const tableNames = tables.map((t) => t.tablename);
    const enumNames = enums.map((e) => e.typname);

    console.log("\n=== TABLES ===");
    console.log(`Found ${tableNames.length}/11:`, tableNames.join(", "));
    const missingTables = EXPECTED_TABLES.filter((t) => !tableNames.includes(t));
    if (missingTables.length > 0) console.log(`MISSING: ${missingTables.join(", ")}`);

    console.log("\n=== ENUMS ===");
    console.log(`Found ${enumNames.length}/7:`, enumNames.join(", "));
    const missingEnums = EXPECTED_ENUMS.filter((e) => !enumNames.includes(e));
    if (missingEnums.length > 0) console.log(`MISSING: ${missingEnums.join(", ")}`);

    console.log("\n=== OBSTACLE_TYPE VALUES ===");
    console.log(`Count: ${obstacleCount[0]?.count}/38`);

    console.log("\n=== RLS STATUS ===");
    const noRls = rls.filter((r) => !r.rls).map((r) => r.tablename);
    const yesRls = rls.filter((r) => r.rls).map((r) => r.tablename);
    console.log(`RLS ENABLED (${yesRls.length}):`, yesRls.join(", "));
    if (noRls.length > 0) console.log(`RLS DISABLED (${noRls.length}):`, noRls.join(", "));

    const allGood =
      missingTables.length === 0 &&
      missingEnums.length === 0 &&
      obstacleCount[0]?.count === "38" &&
      noRls.filter((t) => !t.startsWith("__")).length === 0;

    console.log(`\n${allGood ? "✓ Schema verification passed" : "✗ Schema verification FAILED"}`);
    process.exit(allGood ? 0 : 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
