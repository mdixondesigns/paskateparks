// Display labels for enum values. The DB stores snake_case enums; the UI
// renders human-readable names. Sources for the canonical labels:
//   • obstacles — SITE-AUDIT.md §4 (38 taxonomy terms with WP counts)
//   • amenities — DESIGN.md D18 / VISUAL-DESIGN.md §15 (Amenity row)
//   • helmets   — DESIGN.md D16
//   • link types — DESIGN.md D21 / D23

import {
  obstacleType,
} from "@/db/schema";
import type {
  amenityType,
  helmetsPolicy,
  linkType,
  ridingSurface,
  parkStatus,
  parkType as parkTypeEnum,
} from "@/db/schema";

type AmenityType = (typeof amenityType.enumValues)[number];
type HelmetsPolicy = (typeof helmetsPolicy.enumValues)[number];
type LinkType = (typeof linkType.enumValues)[number];
type ObstacleType = (typeof obstacleType.enumValues)[number];
type RidingSurface = (typeof ridingSurface.enumValues)[number];
type ParkStatus = (typeof parkStatus.enumValues)[number];
type ParkType = (typeof parkTypeEnum.enumValues)[number];

export const amenityLabel: Record<AmenityType, string> = {
  bathroom: "Bathroom",
  drinking_water: "Drinking Water",
  lights: "Lights",
  parking: "Parking",
  spectator_area: "Spectator Area",
  onsite_shop: "Onsite Shop",
  equipment_rentals: "Equipment Rentals",
};

export const helmetsLabel: Record<HelmetsPolicy, string> = {
  none_posted: "No helmet rule posted",
  recommended: "Recommended",
  required_under_12: "Required for skaters under 12",
  required_all_ages: "Required for all ages",
};

export const ridingSurfaceLabel: Record<RidingSurface, string> = {
  concrete: "Concrete",
  asphalt: "Asphalt",
  wood: "Wood",
  other: "Other",
};

export const linkTypeLabel: Record<LinkType, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter",
  youtube: "YouTube",
  tiktok: "TikTok",
  gofundme: "GoFundMe",
  venmo: "Venmo",
  patreon: "Patreon",
  donate: "Donate",
  givebutter: "GiveButter",
  paypal: "PayPal",
  other: "Link",
};

export const parkStatusLabel: Record<ParkStatus, string> = {
  open: "Open",
  temporarily_closed: "Temporarily Closed",
  permanently_closed: "Permanently Closed",
};

export const parkTypeLabel: Record<ParkType, string> = {
  concrete_park: "Concrete Park",
  diy_park: "DIY Park",
  indoor_park: "Indoor Park",
  prefab_park: "Prefab Park",
  skate_plaza: "Skate Plaza",
};

// Obstacle labels from SITE-AUDIT.md §4 — preserve the original WP display names.
export const obstacleLabel: Record<ObstacleType, string> = {
  grind_box_ledge: "Grind Box / Ledge",
  quarter_pipe: "Quarter Pipe",
  flat_rail: "Flat Rail",
  bank_wedge: "Bank / Wedge",
  hubba: "Hubba",
  manual_pad: "Manual Pad",
  funbox: "Funbox",
  hip: "Hip",
  handrail: "Handrail",
  curb: "Curb",
  pyramid: "Pyramid",
  kicker_launch_ramp: "Kicker / Launch Ramp",
  stair: "Stair",
  wallride: "Wallride",
  mini_ramp: "Mini Ramp",
  spine: "Spine",
  euro_london_gap: "Euro / London Gap",
  pool_bowl: "Pool / Bowl",
  extension: "Extension",
  gap: "Gap",
  roll_in: "Roll In",
  volcano: "Volcano",
  jersey_barrier: "Jersey Barrier",
  a_frame: "A-Frame",
  amoeba_pool: "Amoeba Pool",
  box_jump: "Box Jump",
  picnic_table: "Picnic Table",
  pole: "Pole",
  rainbow_rail: "Rainbow Rail",
  escalator: "Escalator",
  full_pipe: "Full Pipe",
  cradle_over_vert: "Cradle / Over Vert",
  snake_run: "Snake Run",
  fire_hydrant: "Fire Hydrant",
  whoop_dee_doo: "Whoop Dee Doo",
  foam_pit: "Foam Pit",
  mega_ramp: "Mega Ramp",
  pump_track: "Pump Track",
};

// Link-type partitioning per D21 (Connect) and D23 (Support).
// Used by ParkProfile to route each park_links row into the right section.
export const CONNECT_LINK_TYPES = [
  "website",
  "instagram",
  "facebook",
  "twitter",
  "youtube",
  "tiktok",
] as const satisfies readonly LinkType[];

export const SUPPORT_LINK_TYPES = [
  "gofundme",
  "venmo",
  "patreon",
  "donate",
  "givebutter",
  "paypal",
] as const satisfies readonly LinkType[];

export function isConnectLink(type: LinkType): boolean {
  return (CONNECT_LINK_TYPES as readonly LinkType[]).includes(type);
}

export function isSupportLink(type: LinkType): boolean {
  return (SUPPORT_LINK_TYPES as readonly LinkType[]).includes(type);
}

// Phase 8 — Obstacle slug helpers for /obstacle/[slug] taxonomy archive routes.
//
// WP stored obstacles as taxonomy term slugs with hyphens (e.g. "quarter-pipe");
// the Drizzle enum stores them as snake_case (e.g. "quarter_pipe"). Round-trip
// is a pure character substitution — verified for all 38 in
// scripts/migrate-wp/transform.ts:331 (slug.replace(/-/g, "_")).
//
// Both helpers are pure + sync so they're safe to use anywhere (RSC, client,
// build script). obstacleForSlug uses a Set lookup (NOT an `as ObstacleType`
// cast) so the return type is honest — unknown slugs return undefined and
// the route falls to notFound().

export function obstacleSlug(obstacle: ObstacleType): string {
  return obstacle.replace(/_/g, "-");
}

const OBSTACLE_SLUG_SET = new Set<string>(
  obstacleType.enumValues.map((v) => v.replace(/_/g, "-")),
);

export function obstacleForSlug(slug: string): ObstacleType | undefined {
  if (!OBSTACLE_SLUG_SET.has(slug)) return undefined;
  return slug.replace(/-/g, "_") as ObstacleType;
}
