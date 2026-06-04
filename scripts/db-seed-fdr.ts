/**
 * Seed a test row for FDR Skatepark to exercise every render branch of
 * the phase 4 park profile template (16 sections per DESIGN.md).
 *
 * Why FDR? It's the most data-dense park in the audit (15 photos, many obstacles,
 * a known builder, paid programming nearby). Phase 4's template gets validated
 * against this row before phase 5's WP migration brings in real data for all 146.
 *
 * Slug is `fdr-test` (not `fdr`) so it doesn't collide with the real WP-migrated
 * row that lands in phase 5. Phase 4 development hits /park/fdr-test/; once
 * phase 5 runs, /park/fdr/ becomes the real one.
 *
 * Run: pnpm db:seed-fdr
 * Re-running is safe — it deletes the existing fdr-test row (FK cascades to
 * children) before inserting fresh.
 */

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../src/db/schema";

const SLUG = "fdr-test";

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error("DIRECT_URL not set in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  try {
    await db.transaction(async (tx) => {
      console.log(`Removing any existing ${SLUG} row + children…`);
      await tx.delete(schema.parks).where(eq(schema.parks.slug, SLUG));

      console.log(`Inserting park: ${SLUG}…`);
      const [park] = await tx
        .insert(schema.parks)
        .values({
          slug: SLUG,
          name: "FDR Skatepark (test seed)",
          status: "open",
          city: "Philadelphia",
          state: "PA",
          establishedYear: 1994,
          parkType: "diy_park",
          county: "Philadelphia",
          streetAddress: "1500 S Broad St (under I-95)",
          zip: "19145",
          lat: 39.9171,
          lng: -75.1814,
          hours: "Dawn to dusk, daily.\n\nWinter (Nov–Mar): expect icy spots after rain.",
          description:
            "FDR Skatepark is a community-built concrete park nestled under I-95 in South Philadelphia. Famous for its bowls and DIY ethos, the park has been continuously expanded since the 1990s by local skaters. This is test seed data — real content lands when the WP migration runs in phase 5.",
          allowsSkateboards: true,
          // Bikes disallowed — tests the diagonal-slash / line-through rendering per VISUAL-DESIGN.md §15.
          allowsBikes: false,
          allowsRollerSkates: true,
          allowsScooters: true,
          vehicleRulesNotes:
            "Bikes prohibited per long-standing local agreement with neighbors. Scooters and skates are welcome.",
          helmets: "recommended",
          otherPadsRequired: false,
          fee: false,
          // Tests the Programming dark band per D27 / VISUAL-DESIGN.md §12.
          programming: true,
          ridingSurfaceNotes:
            "Mostly concrete with some asphalt transitions at the eastern edge.",
        })
        .returning();

      if (!park) throw new Error("parks INSERT returned no row");

      // Renovations — two entries, one with notes, one without.
      await tx.insert(schema.parkRenovations).values([
        {
          parkId: park.id,
          year: 2017,
          notes: "Major concrete refresh + new deep-end bowl",
          sortOrder: 0,
        },
        { parkId: park.id, year: 2022, sortOrder: 1 },
      ]);

      // Multi-surface — exercises the riding-surface multi-select badge row.
      await tx.insert(schema.parkRidingSurfaces).values([
        { parkId: park.id, surface: "concrete" },
        { parkId: park.id, surface: "asphalt" },
      ]);

      // 8 obstacles — exercises the chip list density.
      await tx.insert(schema.parkObstacles).values([
        { parkId: park.id, obstacle: "pool_bowl" },
        { parkId: park.id, obstacle: "quarter_pipe" },
        { parkId: park.id, obstacle: "bank_wedge" },
        { parkId: park.id, obstacle: "hubba" },
        { parkId: park.id, obstacle: "extension" },
        { parkId: park.id, obstacle: "spine" },
        { parkId: park.id, obstacle: "snake_run" },
        { parkId: park.id, obstacle: "volcano" },
      ]);

      // Amenities — mix of present/absent, some with notes, none with photos
      // (photos arrive in phase 5). All 7 rows present so the template renders
      // the universal grid not the partial state.
      await tx.insert(schema.parkAmenities).values([
        {
          parkId: park.id,
          type: "bathroom",
          present: false,
          notes:
            "Nearest public bathroom is about 6 blocks north at the FDR Park visitor center.",
        },
        { parkId: park.id, type: "drinking_water", present: false },
        {
          parkId: park.id,
          type: "parking",
          present: true,
          notes:
            "Free street parking on Pattison Ave; FDR Park lot is a 5-minute walk.",
        },
        {
          parkId: park.id,
          type: "lights",
          present: false,
          notes: "Park is unlit. Plan visits for daylight hours.",
        },
        {
          parkId: park.id,
          type: "spectator_area",
          present: true,
          notes: "Low concrete benches and edges throughout — easy to sit and watch.",
        },
        { parkId: park.id, type: "onsite_shop", present: false },
        { parkId: park.id, type: "equipment_rentals", present: false },
      ]);

      // Links — covers Connect (website + instagram) and Support (gofundme).
      await tx.insert(schema.parkLinks).values([
        {
          parkId: park.id,
          type: "website",
          url: "https://fdrskatepark.org",
          sortOrder: 0,
        },
        {
          parkId: park.id,
          type: "instagram",
          url: "https://instagram.com/fdrskatepark",
          label: "@fdrskatepark",
          sortOrder: 1,
        },
        {
          parkId: park.id,
          type: "gofundme",
          url: "https://gofundme.com/f/fdr-skatepark",
          sortOrder: 2,
        },
      ]);

      // Builder — "DIY" is shared across many community-built parks, so upsert
      // by name (UNIQUE per schema).
      await tx
        .insert(schema.builders)
        .values({ name: "DIY", url: null })
        .onConflictDoNothing({ target: schema.builders.name });

      const [diy] = await tx
        .select()
        .from(schema.builders)
        .where(eq(schema.builders.name, "DIY"))
        .limit(1);
      if (!diy) throw new Error("builders DIY upsert+select failed");

      await tx
        .insert(schema.parkBuilders)
        .values({ parkId: park.id, builderId: diy.id, sortOrder: 0 });

      // Photos — storage paths only (real files arrive in phase 5 via
      // scripts/migrate-wp.ts). The phase 4 <ResponsiveImage> component will
      // render fallback placeholders when the storage object 404s, which is
      // the desired phase-3 behavior.
      await tx.insert(schema.parkPhotos).values([
        {
          parkId: park.id,
          storagePath: "parks/fdr-test/photo-01",
          caption: "The main bowl, mid-afternoon",
          credit: "Test seed",
          altText: "FDR Skatepark main concrete bowl with skater on the lip",
          sortOrder: 0,
        },
        {
          parkId: park.id,
          storagePath: "parks/fdr-test/photo-02",
          caption: "Snake run section, looking south",
          credit: "Test seed",
          altText: "Snake run at FDR Skatepark winding through concrete bowls",
          sortOrder: 1,
        },
        {
          parkId: park.id,
          storagePath: "parks/fdr-test/photo-03",
          credit: "Test seed",
          sortOrder: 2,
        },
      ]);

      console.log(`✓ Inserted park id=${park.id}, slug=${park.slug}`);
    });

    // Verify the joins land correctly.
    const summary = await sql<
      {
        renovations: number;
        surfaces: number;
        obstacles: number;
        amenities: number;
        links: number;
        builders: number;
        photos: number;
      }[]
    >`
      WITH p AS (SELECT id FROM parks WHERE slug = ${SLUG})
      SELECT
        (SELECT count(*)::int FROM park_renovations WHERE park_id = (SELECT id FROM p)) AS renovations,
        (SELECT count(*)::int FROM park_riding_surfaces WHERE park_id = (SELECT id FROM p)) AS surfaces,
        (SELECT count(*)::int FROM park_obstacles WHERE park_id = (SELECT id FROM p)) AS obstacles,
        (SELECT count(*)::int FROM park_amenities WHERE park_id = (SELECT id FROM p)) AS amenities,
        (SELECT count(*)::int FROM park_links WHERE park_id = (SELECT id FROM p)) AS links,
        (SELECT count(*)::int FROM park_builders WHERE park_id = (SELECT id FROM p)) AS builders,
        (SELECT count(*)::int FROM park_photos WHERE park_id = (SELECT id FROM p)) AS photos
    `;
    const s = summary[0];
    if (!s) throw new Error("Verification SELECT returned no row");

    console.log("\n=== fdr-test child-row counts ===");
    console.log(`  renovations: ${s.renovations}/2`);
    console.log(`  riding surfaces: ${s.surfaces}/2`);
    console.log(`  obstacles: ${s.obstacles}/8`);
    console.log(`  amenities: ${s.amenities}/7`);
    console.log(`  links: ${s.links}/3`);
    console.log(`  builders: ${s.builders}/1`);
    console.log(`  photos: ${s.photos}/3`);

    const allGood =
      s.renovations === 2 &&
      s.surfaces === 2 &&
      s.obstacles === 8 &&
      s.amenities === 7 &&
      s.links === 3 &&
      s.builders === 1 &&
      s.photos === 3;
    console.log(`\n${allGood ? "✓ Seed verified" : "✗ Seed counts mismatch — investigate"}`);

    process.exit(allGood ? 0 : 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
