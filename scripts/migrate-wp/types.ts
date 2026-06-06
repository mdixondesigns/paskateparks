/**
 * Migration payload types — the shape the transform layer produces, which
 * the inserter consumes. These are NOT the Drizzle schema types directly
 * because:
 *
 *   1. The transform layer doesn't know about Postgres IDs yet (those are
 *      assigned at INSERT time). Builders are referenced by name, photos by
 *      WP attachment ID + file path — the inserter resolves these.
 *   2. We want the migration script's intermediate shape to be reviewable
 *      independently from the DB. A future `pnpm migrate-wp:dry-run` flag
 *      will dump these payloads to JSON without touching the DB.
 *
 * Field names mirror the Drizzle schema where it's a 1:1 mapping; differ
 * only where the transform layer needs to express "the inserter will resolve
 * this later" (e.g., `builderNames` instead of `builderIds`).
 */

import type {
  amenityType,
  helmetsPolicy,
  linkType,
  obstacleType,
  parkStatus,
  parkType,
  ridingSurface,
} from "../../src/db/schema";

// Re-export Drizzle's inferred enum union types so the transform's outputs
// type-check against the same vocabularies the DB enforces.
export type ParkStatus = (typeof parkStatus.enumValues)[number];
export type ParkType = (typeof parkType.enumValues)[number];
export type HelmetsPolicy = (typeof helmetsPolicy.enumValues)[number];
export type RidingSurface = (typeof ridingSurface.enumValues)[number];
export type LinkType = (typeof linkType.enumValues)[number];
export type AmenityType = (typeof amenityType.enumValues)[number];
export type ObstacleType = (typeof obstacleType.enumValues)[number];

/** Output of the transform layer for one park. Inserter consumes one of these per park. */
export interface ParkPayload {
  // Identity
  wpPostId: number;
  slug: string;
  name: string;

  // Hero / facts
  status: ParkStatus;
  city: string;
  state: string;
  establishedYear: number | null;
  parkType: ParkType | null;
  squareFootage: number | null;
  county: string | null;

  // Address
  streetAddress: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;

  // Body
  hours: string | null;
  description: string | null;

  // Park rules
  allowsSkateboards: boolean;
  allowsBikes: boolean;
  allowsRollerSkates: boolean;
  allowsScooters: boolean;
  vehicleRulesNotes: string | null;
  helmets: HelmetsPolicy | null;
  otherPadsRequired: boolean;
  fee: boolean;
  programming: boolean;

  // Riding surface
  ridingSurfaces: RidingSurface[];
  ridingSurfaceNotes: string | null;

  // Renovations — many rows, sort_order preserved
  renovations: Array<{ year: number; notes: string | null; sortOrder: number }>;

  // Obstacles — many rows, deduped
  obstacles: ObstacleType[];

  // Amenities — exactly 7 rows (we always materialize all 7 per D18)
  amenities: Array<{
    type: AmenityType;
    present: boolean;
    notes: string | null;
    // Amenity photos arrive via attachment IDs; inserter resolves to storage_path.
    photoWpAttachmentId: number | null;
  }>;

  // Connect + Support links — partitioned by type at render time, single table in DB
  links: Array<{ type: LinkType; url: string; label: string | null; sortOrder: number }>;

  // Builders — referenced by name; inserter upserts into `builders` and links via park_builders
  builderNames: string[];

  // Photos — gallery + amenity photos resolved to filesystem paths so step 4
  // can Sharp-resize and upload before step 5 inserts the storage_path rows.
  photos: Array<{
    wpAttachmentId: number;
    wpFilePath: string;       // e.g. "2021/12/FDR_16.jpg" — relative to wp-content/uploads
    altText: string | null;   // from `_wp_attachment_image_alt`
    sortOrder: number;
  }>;
}

/** Output of the transform layer for one builder. */
export interface BuilderPayload {
  wpPostId: number;
  name: string;
  url: string | null;
  // Logo arrives later — phase 5 may or may not migrate builder logos in v1
  logoWpAttachmentId: number | null;
}

/** Output of the transform layer for one shop. */
export interface ShopPayload {
  wpPostId: number;
  name: string;
  url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  state: string;
  logoWpAttachmentId: number | null;
}
