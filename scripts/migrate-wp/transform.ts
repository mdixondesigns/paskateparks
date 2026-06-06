/**
 * Pure transform layer — WpContext → migration payloads.
 *
 * Three exported entrypoints (`parksFromContext`, `buildersFromContext`,
 * `shopsFromContext`) walk the indexed WP data and emit one payload per
 * entity, ready for the inserter to upsert into Postgres.
 *
 * Design rules (locked in step 3 plan):
 *   1. Pure functions — no I/O, no DB access. Input WpContext, output payloads.
 *      Tested in isolation; the inserter is what wires them to the DB.
 *   2. Inserter resolves IDs. We emit `builderNames: ["DIY"]` not
 *      `builderIds: [42]`. Decouples transform correctness from insertion order.
 *   3. Fail loud on unrecognized inputs. Per codex finding #5: never silently
 *      drop a value we don't understand. If WP has an obstacle slug we don't
 *      map, throw — the dev needs to know whether to widen our enum or
 *      explicitly skip it.
 *   4. ACF shape validation at the boundary. Every `phpUnserialize()` result
 *      is type-checked before use — codex finding #5 explicitly.
 */

import { phpUnserialize, type PhpValue } from "./php-unserialize";
import type {
  AmenityType,
  BuilderPayload,
  HelmetsPolicy,
  LinkType,
  ObstacleType,
  ParkPayload,
  ParkStatus,
  ParkType,
  RidingSurface,
  ShopPayload,
} from "./types";
import {
  flatMetaForPost,
  publishedPostsOfType,
  termsForPost,
  wpgmzaForParkTitle,
  type WpContext,
  type WpPost,
} from "./wp-context";

// ─── Enum mappings ──────────────────────────────────────────────────────────

const PARK_STATUS_MAP: Record<string, ParkStatus> = {
  Open: "open",
  "Temporarily Closed": "temporarily_closed",
  "Permanently Closed": "permanently_closed",
};

const PARK_TYPE_MAP: Record<string, ParkType> = {
  "Concrete Park": "concrete_park",
  "DIY Park": "diy_park",
  "Indoor Park": "indoor_park",
  "Prefab Park": "prefab_park",
  "Skate Plaza": "skate_plaza",
};

// Helmets mapping. Some WP values imply pads-required too — handled by the
// optional `pads` flag, which the caller forwards to `otherPadsRequired`.
const HELMETS_MAP: Record<string, { helmets: HelmetsPolicy; pads?: true }> = {
  None: { helmets: "none_posted" },
  "None posted": { helmets: "none_posted" },
  Recommended: { helmets: "recommended" },
  "Required under 12": { helmets: "required_under_12" },
  "Required all ages": { helmets: "required_all_ages" },
  // Real data findings (probe against 48 parks surfaced 3 distinct values):
  //   "None"            → none_posted (39 parks)
  //   "Helmet Only"     → required_all_ages, no pads (5 parks)
  //   "Helmet and Pads" → required_all_ages, pads=true (4 parks)
  "Helmet Only": { helmets: "required_all_ages" },
  "Helmet and Pads": { helmets: "required_all_ages", pads: true },
};

const RIDING_SURFACE_MAP: Record<string, RidingSurface> = {
  concrete: "concrete",
  asphalt: "asphalt",
  wood: "wood",
  // Per phase-5-plan riding-surface decision: brick/metal/tennis-court/coated-steel
  // all collapse to "other"; the original name is preserved in ridingSurfaceNotes.
  brick: "other",
  metal: "other",
  "tennis-court": "other",
  "coated-steel": "other",
};

const SUPPORT_LABEL_MAP: Record<string, LinkType> = {
  GoFundMe: "gofundme",
  Venmo: "venmo",
  Patreon: "patreon",
  Donate: "donate",
  GiveButter: "givebutter",
  PayPal: "paypal",
};

// The 38 obstacles in our enum. WP slugs use hyphens; we use underscores.
const OBSTACLE_SET = new Set<ObstacleType>([
  "grind_box_ledge", "quarter_pipe", "flat_rail", "bank_wedge", "hubba",
  "manual_pad", "funbox", "hip", "handrail", "curb", "pyramid",
  "kicker_launch_ramp", "stair", "wallride", "mini_ramp", "spine",
  "euro_london_gap", "pool_bowl", "extension", "gap", "roll_in",
  "volcano", "jersey_barrier", "a_frame", "amoeba_pool", "box_jump",
  "picnic_table", "pole", "rainbow_rail", "escalator", "full_pipe",
  "cradle_over_vert", "snake_run", "fire_hydrant", "whoop_dee_doo",
  "foam_pit", "mega_ramp", "pump_track",
]);

// ─── Field coercion helpers ─────────────────────────────────────────────────

/** ACF stores "0"/"1" for booleans. Treat null/empty as false. */
function asBool(value: string | null | undefined): boolean {
  return value === "1";
}

/** Parse an integer-typed meta value; "" / null → null. */
function asNullableInt(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Trim a string; "" / null → null. */
function asNullableStr(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// ─── Shape validators for phpUnserialize results (codex finding #5) ─────────

function asPhpStringArray(value: PhpValue, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: expected PHP array, got ${typeof value} (${JSON.stringify(value).slice(0, 80)})`);
  }
  return value.map((v, i) => {
    if (typeof v !== "string") {
      throw new Error(`${context}: expected string at index ${i}, got ${typeof v}`);
    }
    return v;
  });
}

function asPhpObject(value: PhpValue, context: string): Record<string, PhpValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context}: expected PHP assoc array, got ${typeof value}`);
  }
  return value as Record<string, PhpValue>;
}

// ─── Gutenberg block stripping ──────────────────────────────────────────────

/**
 * Strip Gutenberg block comments from post_content. WP block editor emits HTML
 * with `<!-- wp:paragraph --> ... <!-- /wp:paragraph -->` around blocks. The
 * comments are useless on the public site. We keep the inner HTML so any
 * formatting the owner authored survives.
 */
function stripGutenbergBlocks(html: string): string {
  return html
    .replace(/<!--\s*\/?wp:[^>]*-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── ACF repeater walker ────────────────────────────────────────────────────

/**
 * Walk an ACF repeater field. ACF stores repeaters as:
 *   <field>            = "<count>"
 *   <field>_<N>_<sub>  = "<value>"   for N in 0..count-1
 *
 * Returns an array of accessor functions, one per repeater item. Caller pulls
 * subkeys from each accessor: `r.get("link")`, `r.get("page_name")`, etc.
 *
 * Returns [] if the field is missing or count is 0.
 */
function walkAcfRepeater(
  meta: Map<string, string | null>,
  fieldName: string,
): Array<{ index: number; get: (subkey: string) => string | null }> {
  const countRaw = meta.get(fieldName);
  if (!countRaw) return [];
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count <= 0) return [];
  const out: Array<{ index: number; get: (subkey: string) => string | null }> = [];
  for (let i = 0; i < count; i++) {
    out.push({
      index: i,
      get: (subkey: string) => meta.get(`${fieldName}_${i}_${subkey}`) ?? null,
    });
  }
  return out;
}

// ─── Photo resolution ───────────────────────────────────────────────────────

/**
 * Resolve a WP attachment ID to its file path (relative to wp-content/uploads)
 * and alt text. Returns null if the attachment post doesn't exist.
 */
function resolveAttachment(
  ctx: WpContext,
  attachmentId: number,
): { wpFilePath: string; altText: string | null } | null {
  const post = ctx.posts.get(attachmentId);
  if (!post || post.postType !== "attachment") return null;
  const meta = ctx.metaByPostId.get(attachmentId) ?? [];
  let filePath: string | null = null;
  let altText: string | null = null;
  for (const m of meta) {
    if (m.metaKey === "_wp_attached_file" && m.metaValue) filePath = m.metaValue;
    if (m.metaKey === "_wp_attachment_image_alt" && m.metaValue) altText = m.metaValue;
  }
  if (!filePath) return null;
  return { wpFilePath: filePath, altText };
}

// ─── Per-park transform ─────────────────────────────────────────────────────

function transformOnePark(ctx: WpContext, post: WpPost): ParkPayload {
  const meta = flatMetaForPost(ctx, post.id);

  // Address block — primary source is the ACF `location` field (parsed Google
  // Places response). Fall back to wp_wpgmza if location is empty.
  let lat: number | null = null;
  let lng: number | null = null;
  let city: string | null = null;
  let stateShort: string | null = null;
  let streetAddress: string | null = null;
  let zip: string | null = null;

  const locationRaw = meta.get("location");
  if (locationRaw) {
    const loc = asPhpObject(
      phpUnserialize(locationRaw),
      `park ${post.postName}: location ACF field`,
    );
    if (typeof loc.lat === "number") lat = loc.lat;
    if (typeof loc.lng === "number") lng = loc.lng;
    if (typeof loc.city === "string") city = loc.city.trim() || null;
    if (typeof loc.state_short === "string") stateShort = loc.state_short.trim() || null;
    if (typeof loc.street_name_short === "string") {
      streetAddress = loc.street_name_short.trim() || null;
    } else if (typeof loc.street_name === "string") {
      streetAddress = loc.street_name.trim() || null;
    }
    if (typeof loc.post_code === "string") zip = loc.post_code.trim() || null;
  }
  if (lat == null || lng == null) {
    const gmza = wpgmzaForParkTitle(ctx, post.postTitle);
    if (gmza) {
      const gLat = Number(gmza.lat);
      const gLng = Number(gmza.lng);
      if (Number.isFinite(gLat) && Number.isFinite(gLng)) {
        lat ??= gLat;
        lng ??= gLng;
      }
    }
  }

  // Status mapping — required field; bail if WP has something we don't recognize
  const statusRaw = meta.get("status") ?? "Open";
  const status = PARK_STATUS_MAP[statusRaw];
  if (!status) {
    throw new Error(`park ${post.postName}: unrecognized status ${JSON.stringify(statusRaw)}`);
  }

  // Park type — optional, but warn if unrecognized
  const parkTypeRaw = meta.get("park_type");
  let parkType: ParkType | null = null;
  if (parkTypeRaw) {
    const mapped = PARK_TYPE_MAP[parkTypeRaw];
    if (!mapped) {
      throw new Error(`park ${post.postName}: unrecognized park_type ${JSON.stringify(parkTypeRaw)}`);
    }
    parkType = mapped;
  }

  // Helmets — optional, but if present must map. Some WP values imply
  // pads-required too; the map's `pads` flag flows into `otherPadsRequired`.
  const helmetsRaw = meta.get("pads_required");
  let helmets: HelmetsPolicy | null = null;
  let otherPadsRequired = false;
  if (helmetsRaw && helmetsRaw !== "") {
    const mapped = HELMETS_MAP[helmetsRaw];
    if (!mapped) {
      throw new Error(`park ${post.postName}: unrecognized pads_required ${JSON.stringify(helmetsRaw)}`);
    }
    helmets = mapped.helmets;
    if (mapped.pads) otherPadsRequired = true;
  }

  // Riding surface — ACF stores term IDs as PHP-serialized array. Look up each
  // term, map slug → enum, dedupe. Collapsed "other" values are noted below.
  const ridingSurfaces: RidingSurface[] = [];
  const otherSurfaceNames: string[] = [];
  const ridingSurfaceRaw = meta.get("riding_surface");
  if (ridingSurfaceRaw) {
    const termIds = asPhpStringArray(
      phpUnserialize(ridingSurfaceRaw),
      `park ${post.postName}: riding_surface`,
    );
    for (const tid of termIds) {
      const termId = Number(tid);
      const term = ctx.terms.get(termId);
      if (!term) continue;
      const mapped = RIDING_SURFACE_MAP[term.slug];
      if (!mapped) {
        throw new Error(
          `park ${post.postName}: unmapped riding_surface slug ${JSON.stringify(term.slug)}. Add it to RIDING_SURFACE_MAP or wire it to "other".`,
        );
      }
      if (!ridingSurfaces.includes(mapped)) ridingSurfaces.push(mapped);
      if (mapped === "other") otherSurfaceNames.push(term.name);
    }
  }

  // Surface notes — combine WP's surface_notes with collapsed "other" names
  let ridingSurfaceNotes = asNullableStr(meta.get("surface_notes"));
  if (otherSurfaceNames.length > 0) {
    const prefix = `Other surface types: ${otherSurfaceNames.join(", ")}.`;
    ridingSurfaceNotes = ridingSurfaceNotes ? `${prefix} ${ridingSurfaceNotes}` : prefix;
  }

  // Obstacles — canonical source is wp_term_relationships joined to taxonomy
  // 'park_obstacles', NOT the postmeta `obstacles` array (those agree but
  // taxonomy is the authority).
  const obstacles: ObstacleType[] = [];
  for (const t of termsForPost(ctx, post.id)) {
    if (t.taxonomy !== "park_obstacles") continue;
    const enumValue = t.term.slug.replace(/-/g, "_") as ObstacleType;
    if (!OBSTACLE_SET.has(enumValue)) {
      throw new Error(
        `park ${post.postName}: obstacle slug ${JSON.stringify(t.term.slug)} (mapped to ${JSON.stringify(enumValue)}) is not in our 38-value enum. Add it to obstacle_type or remove from WP.`,
      );
    }
    if (!obstacles.includes(enumValue)) obstacles.push(enumValue);
  }
  obstacles.sort();

  // County — meta.county is a term ID. Look up the term, use its name.
  let county: string | null = null;
  const countyRaw = meta.get("county");
  if (countyRaw) {
    const countyTermId = Number(countyRaw);
    const countyTerm = ctx.terms.get(countyTermId);
    if (countyTerm) county = countyTerm.name;
  }

  // Renovations — ACF repeater on `years_refurbished`
  const renovations: ParkPayload["renovations"] = [];
  for (const r of walkAcfRepeater(meta, "years_refurbished")) {
    const yearRaw = r.get("year");
    const year = asNullableInt(yearRaw);
    if (year == null) continue;
    renovations.push({
      year,
      notes: asNullableStr(r.get("notes")),
      sortOrder: r.index,
    });
  }

  // Amenities — exactly 7 rows, one per amenity_type enum value. WP stores
  // each amenity differently (some boolean, some typed, some with notes).
  const amenities = buildAmenities(meta);

  // Links — Connect (websites/IG/FB/YT) + Support (gofundme/etc.) → park_links
  const links = buildLinks(post.postName, meta);

  // Builders — ACF repeater `builders` of builder post IDs. Resolve to names;
  // the inserter upserts and links via park_builders.
  const builderNames: string[] = [];
  for (const r of walkAcfRepeater(meta, "builders")) {
    const builderIdRaw = r.get("builder");
    if (!builderIdRaw) continue;
    const builderPost = ctx.posts.get(Number(builderIdRaw));
    if (!builderPost || builderPost.postType !== "builder") continue;
    const name = builderPost.postTitle.trim();
    if (name && !builderNames.includes(name)) builderNames.push(name);
  }

  // Photos — `gallery` PHP-serialized array of attachment IDs. Each ID resolves
  // to its file path so step 4 can Sharp-resize from disk.
  const photos: ParkPayload["photos"] = [];
  const galleryRaw = meta.get("gallery");
  if (galleryRaw) {
    const attachmentIds = asPhpStringArray(
      phpUnserialize(galleryRaw),
      `park ${post.postName}: gallery`,
    );
    for (let i = 0; i < attachmentIds.length; i++) {
      const idStr = attachmentIds[i];
      if (!idStr) continue;
      const id = Number(idStr);
      if (!Number.isInteger(id)) continue;
      const resolved = resolveAttachment(ctx, id);
      if (!resolved) continue;
      photos.push({
        wpAttachmentId: id,
        wpFilePath: resolved.wpFilePath,
        altText: resolved.altText,
        sortOrder: i,
      });
    }
  }

  return {
    wpPostId: post.id,
    slug: post.postName,
    name: post.postTitle.trim(),

    status,
    city: city ?? "",
    state: stateShort ?? "PA",
    establishedYear: asNullableInt(meta.get("year_opened")),
    parkType,
    squareFootage: asNullableInt(meta.get("park_size")),
    county,

    streetAddress,
    zip,
    lat,
    lng,

    hours: asNullableStr(meta.get("hours")),
    description: asNullableStr(stripGutenbergBlocks(post.postContent)),

    allowsSkateboards: asBool(meta.get("skateboards_allowed")),
    allowsBikes: asBool(meta.get("bikes_allowed")),
    allowsRollerSkates: asBool(meta.get("skates_blades_allowed")),
    allowsScooters: asBool(meta.get("scooters_allowed")),
    vehicleRulesNotes: null, // WP doesn't have a dedicated field; was inlined in description
    helmets,
    otherPadsRequired,
    fee: asBool(meta.get("fee")),
    programming: false, // Owner toggles in Studio post-launch per D27

    ridingSurfaces,
    ridingSurfaceNotes,

    renovations,
    obstacles,
    amenities,
    links,
    builderNames,
    photos,
  };
}

// ─── Amenity & Link sub-builders ────────────────────────────────────────────

function buildAmenities(meta: Map<string, string | null>): ParkPayload["amenities"] {
  const out: ParkPayload["amenities"] = [];

  // Bathroom — present if bathroom_type is set and not "None"
  const bathroomType = asNullableStr(meta.get("bathroom_type"));
  out.push({
    type: "bathroom",
    present: bathroomType != null && bathroomType.toLowerCase() !== "none",
    // Include the type in the notes so "Porta" / "Permanent" survives.
    notes: composeNotes([bathroomType, asNullableStr(meta.get("bathroom_notes"))]),
    photoWpAttachmentId: null,
  });

  // Drinking water
  out.push({
    type: "drinking_water",
    present: asBool(meta.get("drinking_water")),
    notes: null,
    photoWpAttachmentId: null,
  });

  // Lights
  out.push({
    type: "lights",
    present: asBool(meta.get("lights")),
    notes: asNullableStr(meta.get("lights_notes")),
    photoWpAttachmentId: null,
  });

  // Parking — present if parking_type set and not "None"
  const parkingType = asNullableStr(meta.get("parking_type"));
  const parkingNotes = asNullableStr(meta.get("parking_notes"));
  const parkingFee = asBool(meta.get("parking_fee"));
  out.push({
    type: "parking",
    present: parkingType != null && parkingType.toLowerCase() !== "none",
    notes: composeNotes([
      parkingType,
      parkingFee ? "Fee: yes" : null,
      parkingNotes,
    ]),
    photoWpAttachmentId: null,
  });

  // Spectator area — spectator_type is a PHP-serialized array of strings
  const spectatorRaw = meta.get("spectator_type");
  let spectatorTypes: string[] = [];
  if (spectatorRaw) {
    try {
      const parsed = phpUnserialize(spectatorRaw);
      if (Array.isArray(parsed)) {
        spectatorTypes = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // empty / malformed — leave spectatorTypes empty
    }
  }
  const spectatorNotes = asNullableStr(meta.get("spectator_notes"));
  out.push({
    type: "spectator_area",
    present: spectatorTypes.length > 0,
    notes: composeNotes([
      spectatorTypes.length > 0 ? spectatorTypes.join(", ") : null,
      spectatorNotes,
    ]),
    photoWpAttachmentId: null,
  });

  // Onsite shop
  out.push({
    type: "onsite_shop",
    present: asBool(meta.get("onsite_shop")),
    notes: null,
    photoWpAttachmentId: null,
  });

  // Equipment rentals
  out.push({
    type: "equipment_rentals",
    present: asBool(meta.get("equipment_rentals")),
    notes: null,
    photoWpAttachmentId: null,
  });

  return out;
}

function composeNotes(parts: Array<string | null>): string | null {
  const filtered = parts.filter((p): p is string => p != null && p.trim() !== "");
  if (filtered.length === 0) return null;
  return filtered.join(". ");
}

function buildLinks(parkSlug: string, meta: Map<string, string | null>): ParkPayload["links"] {
  const out: ParkPayload["links"] = [];
  let sortOrder = 0;

  // Websites — ACF repeater with page_name + link
  for (const r of walkAcfRepeater(meta, "website")) {
    const link = asNullableStr(r.get("link"));
    if (!link) continue;
    out.push({
      type: "website",
      url: link,
      label: asNullableStr(r.get("page_name")),
      sortOrder: sortOrder++,
    });
  }

  // Instagram — ACF repeater with handle (no full URL)
  for (const r of walkAcfRepeater(meta, "instagram_handle")) {
    const handle = asNullableStr(r.get("handle"));
    if (!handle) continue;
    const cleanHandle = handle.replace(/^@+/, "");
    out.push({
      type: "instagram",
      url: `https://instagram.com/${cleanHandle}`,
      label: `@${cleanHandle}`,
      sortOrder: sortOrder++,
    });
  }

  // Facebook — ACF repeater with page_name + link
  for (const r of walkAcfRepeater(meta, "facebook_page")) {
    const link = asNullableStr(r.get("link"));
    if (!link) continue;
    out.push({
      type: "facebook",
      url: link,
      label: asNullableStr(r.get("page_name")),
      sortOrder: sortOrder++,
    });
  }

  // YouTube — ACF "youtube_channel" pattern is similar to instagram (single value).
  // FDR has an empty youtube_channel meta but may have repeater subkeys we don't
  // know about. For v1, treat youtube_channel as repeater with `handle` subkey.
  for (const r of walkAcfRepeater(meta, "youtube_channel")) {
    const handle = asNullableStr(r.get("handle"));
    const link = asNullableStr(r.get("link"));
    const url = link ?? (handle ? `https://youtube.com/${handle}` : null);
    if (!url) continue;
    out.push({
      type: "youtube",
      url,
      label: handle ? `@${handle.replace(/^@+/, "")}` : null,
      sortOrder: sortOrder++,
    });
  }

  // Support the park — ACF repeater with support_label + support_link.
  // `support_label` tells us the platform.
  for (const r of walkAcfRepeater(meta, "support_the_park")) {
    const link = asNullableStr(r.get("support_link"));
    if (!link) continue;
    const labelRaw = asNullableStr(r.get("support_label"));
    let type: LinkType = "other";
    if (labelRaw) {
      const mapped = SUPPORT_LABEL_MAP[labelRaw];
      if (mapped) type = mapped;
      else {
        // Unknown support platform — surface but don't fail. Owner can fix in Studio.
        console.warn(
          `[transform] park ${parkSlug}: unrecognized support_label ${JSON.stringify(labelRaw)} — defaulting to "other"`,
        );
      }
    }
    out.push({
      type,
      url: link,
      label: labelRaw,
      sortOrder: sortOrder++,
    });
  }

  return out;
}

// ─── Top-level transforms ───────────────────────────────────────────────────

export function parksFromContext(ctx: WpContext): ParkPayload[] {
  return publishedPostsOfType(ctx, "park").map((p) => transformOnePark(ctx, p));
}

export function buildersFromContext(ctx: WpContext): BuilderPayload[] {
  return publishedPostsOfType(ctx, "builder").map((post) => {
    const meta = flatMetaForPost(ctx, post.id);
    const link = asNullableStr(meta.get("link") ?? meta.get("website") ?? meta.get("url"));
    // Builders may have a logo in `_thumbnail_id`. Resolve later in step 4 if so.
    const rawMeta = ctx.metaByPostId.get(post.id) ?? [];
    const thumb = rawMeta.find((m) => m.metaKey === "_thumbnail_id");
    const logoWpAttachmentId = thumb?.metaValue ? Number(thumb.metaValue) : null;
    return {
      wpPostId: post.id,
      name: post.postTitle.trim(),
      url: link,
      logoWpAttachmentId: Number.isInteger(logoWpAttachmentId) ? logoWpAttachmentId : null,
    };
  });
}

export function shopsFromContext(ctx: WpContext): ShopPayload[] {
  return publishedPostsOfType(ctx, "shop").map((post) => {
    const meta = flatMetaForPost(ctx, post.id);
    const link = asNullableStr(meta.get("link") ?? meta.get("website") ?? meta.get("url"));

    // Shop address + lat/lng — prefer ACF location if present, fall back to wpgmza
    let lat: number | null = null;
    let lng: number | null = null;
    let address: string | null = null;
    let stateShort: string | null = null;
    const locationRaw = meta.get("location");
    if (locationRaw) {
      try {
        const loc = asPhpObject(phpUnserialize(locationRaw), `shop ${post.postName}: location`);
        if (typeof loc.lat === "number") lat = loc.lat;
        if (typeof loc.lng === "number") lng = loc.lng;
        if (typeof loc.address === "string") address = loc.address;
        if (typeof loc.state_short === "string") stateShort = loc.state_short;
      } catch {
        // Fall through to wpgmza below.
      }
    }
    if (lat == null || lng == null) {
      const gmza = wpgmzaForParkTitle(ctx, post.postTitle);
      if (gmza) {
        const gLat = Number(gmza.lat);
        const gLng = Number(gmza.lng);
        if (Number.isFinite(gLat) && Number.isFinite(gLng)) {
          lat ??= gLat;
          lng ??= gLng;
          address ??= gmza.address;
        }
      }
    }

    const rawMeta = ctx.metaByPostId.get(post.id) ?? [];
    const thumb = rawMeta.find((m) => m.metaKey === "_thumbnail_id");
    const logoWpAttachmentId = thumb?.metaValue ? Number(thumb.metaValue) : null;

    return {
      wpPostId: post.id,
      name: post.postTitle.trim(),
      url: link,
      address,
      lat,
      lng,
      state: stateShort ?? "PA",
      logoWpAttachmentId: Number.isInteger(logoWpAttachmentId) ? logoWpAttachmentId : null,
    };
  });
}
