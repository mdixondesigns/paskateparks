// Postgres schema for paskateparks.com.
// Canonical DB shape: STACK-PIVOT.md §"Final schema (Postgres)" + the applied
// SQL in supabase/migrations/. This file is the TYPE source of truth only — the
// migration files are the DB source of truth.
//
// To change the schema:
//   1. Hand-write a new SQL migration in supabase/migrations/ (NNNN_name.sql).
//   2. Update this file to match, so the generated types line up.
//   3. Apply with `pnpm db:migrate` (has `--dry-run`).
//
// Do NOT run `pnpm db:generate` / drizzle-kit generate. Its stored snapshot is
// stale and emits destructive diffs (tries to recreate `profiles`, re-add
// `alias`). Migrations here are hand-written, not generated.
//
// Ordering matters: local dev connects to the shared PROD DB, and
// select().from(parks) lists every column declared here — so adding a column to
// this file before the migration is applied breaks ALL park reads (local + prod)
// until you run the migration. Apply the migration first, or in the same deploy.

import {
  boolean,
  cidr,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────

export const parkStatus = pgEnum("park_status", [
  "open",
  "temporarily_closed",
  "permanently_closed",
]);

export const parkType = pgEnum("park_type", [
  "concrete_park",
  "diy_park",
  "indoor_park",
  "prefab_park",
  "skate_plaza",
]);

export const helmetsPolicy = pgEnum("helmets_policy", [
  "none_posted",
  "recommended",
  "required_under_12",
  "required_all_ages",
]);

export const ridingSurface = pgEnum("riding_surface", [
  "concrete",
  "asphalt",
  "wood",
  "other",
]);

export const linkType = pgEnum("link_type", [
  "website",
  "instagram",
  "facebook",
  "twitter",
  "youtube",
  "tiktok",
  "gofundme",
  "venmo",
  "patreon",
  "donate",
  "givebutter",
  "paypal",
  "other",
]);

export const amenityType = pgEnum("amenity_type", [
  "bathroom",
  "drinking_water",
  "lights",
  "parking",
  "spectator_area",
  "onsite_shop",
  "equipment_rentals",
]);

// 38 obstacles from WP taxonomy. Enum (not TEXT) prevents typo-driven silent
// new obstacles in Studio. Adding a new obstacle = ALTER TYPE ADD VALUE migration.
export const obstacleType = pgEnum("obstacle_type", [
  "grind_box_ledge",
  "quarter_pipe",
  "flat_rail",
  "bank_wedge",
  "hubba",
  "manual_pad",
  "funbox",
  "hip",
  "handrail",
  "curb",
  "pyramid",
  "kicker_launch_ramp",
  "stair",
  "wallride",
  "mini_ramp",
  "spine",
  "euro_london_gap",
  "pool_bowl",
  "extension",
  "gap",
  "roll_in",
  "volcano",
  "jersey_barrier",
  "a_frame",
  "amoeba_pool",
  "box_jump",
  "picnic_table",
  "pole",
  "rainbow_rail",
  "escalator",
  "full_pipe",
  "cradle_over_vert",
  "snake_run",
  "fire_hydrant",
  "whoop_dee_doo",
  "foam_pit",
  "mega_ramp",
  "pump_track",
]);

// ── Core tables ──────────────────────────────────────────────────────────────

export const parks = pgTable(
  "parks",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: parkStatus("status").notNull().default("open"),
    city: text("city").notNull(),
    state: text("state").notNull().default("PA"),
    establishedYear: integer("established_year"),
    parkType: parkType("park_type"),
    squareFootage: integer("square_footage"),
    county: text("county"),
    streetAddress: text("street_address"),
    zip: text("zip"),
    // Unofficial / local name. "Wawa Park" for Robert E. Lambert, "4th Street"
    // for Carl W. Saldutti, etc. Surfaced under the H1 and matched in the
    // homepage search filter so locals can find parks by either name.
    alias: text("alias"),
    // lat/lng nullable: stub parks may not have coords yet (verified 2026-07-15:
    // 111 of 159 parks are stubs; only 1 currently lacks coords). Render-time:
    // NULL coords → excluded from /map/ + Nearby compute, profile still renders.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    hours: text("hours"),
    description: text("description"),
    // Optional purpose-shot panorama for the hero band. When null, HeroBlock
    // falls back to the first gallery photo (park_photos[0]) — which is also the
    // map marker/popup thumbnail. Populated per-park via seed/SQL until an admin
    // photo-upload UI exists (see TODOS.md). Mirrors ridingSurfacePhotoPath.
    heroPhotoPath: text("hero_photo_path"),
    allowsSkateboards: boolean("allows_skateboards").notNull().default(true),
    allowsBikes: boolean("allows_bikes").notNull().default(true),
    allowsRollerSkates: boolean("allows_roller_skates").notNull().default(true),
    allowsScooters: boolean("allows_scooters").notNull().default(true),
    vehicleRulesNotes: text("vehicle_rules_notes"),
    helmets: helmetsPolicy("helmets").default("none_posted"),
    otherPadsRequired: boolean("other_pads_required").default(false),
    fee: boolean("fee").default(false),
    programming: boolean("programming").default(false),
    ridingSurfaceNotes: text("riding_surface_notes"),
    ridingSurfacePhotoPath: text("riding_surface_photo_path"),
    // temporarily_closed reopen tracking — stale banners would erode trust.
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    reopenExpectedAt: date("reopen_expected_at"),
    // Migration idempotency key (phase 5). UNIQUE so ON CONFLICT works.
    wpPostId: integer("wp_post_id").unique(),
    // D18 observability — when did /api/revalidate last touch this slug?
    lastRevalidatedAt: timestamp("last_revalidated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("parks_slug_idx").on(t.slug),
    // Phase 8 CMT-6A — supports /county/[slug] WHERE status='open' AND county=X.
    // Composite (county, status) means the index can satisfy both the
    // WHERE-by-county and the WHERE-by-status filters with a single index scan
    // (Postgres can use a multi-column index for either a leading-column
    // predicate alone or both columns).
    index("parks_county_status_idx").on(t.county, t.status),
  ],
);

export const parkRenovations = pgTable("park_renovations", {
  id: serial("id").primaryKey(),
  parkId: integer("park_id")
    .notNull()
    .references(() => parks.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const parkRidingSurfaces = pgTable(
  "park_riding_surfaces",
  {
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    surface: ridingSurface("surface").notNull(),
  },
  (t) => [primaryKey({ columns: [t.parkId, t.surface] })],
);

export const parkObstacles = pgTable(
  "park_obstacles",
  {
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    obstacle: obstacleType("obstacle").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.parkId, t.obstacle] }),
    // Phase 8 CMT-6A — supports /obstacle/[slug] WHERE obstacle=X. The PK on
    // (park_id, obstacle) leads with park_id, so a filter-by-obstacle hits no
    // index. This standalone index on obstacle makes the taxonomy archive
    // queries fast as the row count scales past the current ~150.
    index("park_obstacles_obstacle_idx").on(t.obstacle),
  ],
);

// E4 — universal amenity model as child table, not 21-flat-column model.
export const parkAmenities = pgTable(
  "park_amenities",
  {
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    type: amenityType("type").notNull(),
    present: boolean("present").notNull().default(false),
    notes: text("notes"),
    photoPath: text("photo_path"),
  },
  (t) => [
    primaryKey({ columns: [t.parkId, t.type] }),
    index("park_amenities_park_idx").on(t.parkId),
  ],
);

// Replaces D7 free-text ParkLinks parser — structured rows, renderer dispatches by `type`.
export const parkLinks = pgTable(
  "park_links",
  {
    id: serial("id").primaryKey(),
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    type: linkType("type").notNull(),
    url: text("url").notNull(),
    label: text("label"), // e.g. "@fdrskatepark"
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("park_links_park_idx").on(t.parkId, t.sortOrder)],
);

export const builders = pgTable("builders", {
  id: serial("id").primaryKey(),
  // UNIQUE — prevents duplicate "DIY" / "Spohn Ranch" silent inserts. Migration
  // normalizes names (trim, casefold-compare) before insert per A3.
  name: text("name").notNull().unique(),
  url: text("url"),
  logoPath: text("logo_path"),
  wpPostId: integer("wp_post_id").unique(),
});

export const parkBuilders = pgTable(
  "park_builders",
  {
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    builderId: integer("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.parkId, t.builderId] })],
);

export const shops = pgTable("shops", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  logoPath: text("logo_path"),
  address: text("address"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  state: text("state").notNull().default("PA"),
  wpPostId: integer("wp_post_id").unique(),
});

// D29 child table — replaces multi-attachment field on Parks for forward
// contributor credits.
export const parkPhotos = pgTable(
  "park_photos",
  {
    id: serial("id").primaryKey(),
    parkId: integer("park_id")
      .notNull()
      .references(() => parks.id, { onDelete: "cascade" }),
    // e.g. 'parks/fdr/photo-01' — the renderer appends @{400,800,1200}w.jpg.
    // (Originally WebP per F2 spec; amended to JPEG in phase 5 for shareability.)
    storagePath: text("storage_path").notNull(),
    credit: text("credit"),
    caption: text("caption"),
    altText: text("alt_text"), // TODOS.md P1 — owner backfills
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("park_photos_park_idx").on(t.parkId, t.sortOrder)],
);

export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  parkId: integer("park_id")
    .notNull()
    .references(() => parks.id, { onDelete: "restrict" }),
  submitterName: text("submitter_name"),
  submitterEmail: text("submitter_email"),
  changeDescription: text("change_description").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("new"), // new | in_review | applied | rejected
  // /24-truncated CIDR (not raw INET) — PII reduction per STACK-PIVOT.md finding #11.
  // API route runs `inet '192.168.1.5' & inet '255.255.255.0'` before insert.
  submitterIpTruncated: cidr("submitter_ip_truncated"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// User accounts v1 (docs/designs/user-accounts-v1.md). 1:1 with auth.users;
// row is created by the on_auth_user_created trigger, NOT by app code, and
// id references auth.users(id) ON DELETE CASCADE — both live only in
// supabase/migrations/0007_profiles.sql because Drizzle doesn't model the
// auth schema. Reads/writes from app code use the user-scoped @supabase/ssr
// client (RLS-enforced, decision CM4), NEVER the Drizzle secret-key clients.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
