/**
 * One-pass loader for the WordPress mysqldump.
 *
 * Reads `data/wp-export/mysql.sql` (or any path you pass), walks the tables
 * we care about, and returns a `WpContext` — a set of in-memory maps keyed
 * for fast lookup by the pure transform functions in `transform.ts`.
 *
 * Tables consumed:
 *   wp_posts            — every park, builder, shop, attachment row
 *   wp_postmeta         — every meta key/value (ACF fields live here)
 *   wp_terms            — taxonomy term name + slug
 *   wp_term_taxonomy    — links term_id → taxonomy name
 *   wp_term_relationships — links object_id (post_id) → term_taxonomy_id
 *   wp_wpgmza           — WP Google Maps marker rows (lat/lng for parks + shops)
 *
 * Tables explicitly NOT consumed (and why):
 *   wp_options, wp_users, wp_comments — not migrated
 *   wp_actionscheduler_*, wp_relevanssi_*, wp_search_filter_* — plugin cache
 *   wp_wpforms_* — form submissions (TODOS.md P1 — handled separately if we
 *                  decide to migrate /new-park/ submissions)
 *   wp_wpmailsmtp_* — email plugin
 */

import { extractTableValues, iterRows, readDump } from "./dump-reader";

// ─── Raw row shapes (1:1 with WP table columns) ───────────────────────────────

export interface WpPost {
  id: number;
  postContent: string;
  postTitle: string;
  postStatus: string;   // 'publish' | 'draft' | 'inherit' | ...
  postName: string;     // slug
  postType: string;     // 'park' | 'builder' | 'shop' | 'attachment' | ...
  guid: string;         // useful for attachments (sometimes contains the upload URL)
}

export interface WpMeta {
  postId: number;
  metaKey: string;
  metaValue: string | null;
}

export interface WpTerm {
  termId: number;
  name: string;
  slug: string;
}

export interface WpTermTaxonomy {
  termTaxonomyId: number;
  termId: number;
  taxonomy: string;
}

export interface WpTermRelationship {
  objectId: number;        // post_id
  termTaxonomyId: number;
}

export interface WpgmzaMarker {
  id: number;
  address: string;
  lat: string;             // varchar in source; convert to number at use site
  lng: string;
  title: string;
}

// ─── Indexed view used by the transform layer ─────────────────────────────────

export interface WpContext {
  /** All posts keyed by ID. Includes attachments. */
  posts: Map<number, WpPost>;
  /** Posts grouped by type for quick enumeration. */
  postsByType: Map<string, WpPost[]>;
  /** Meta rows for one post — preserves insertion order so ACF repeater fields
      stay in their original sequence. */
  metaByPostId: Map<number, WpMeta[]>;
  /** All terms by id. */
  terms: Map<number, WpTerm>;
  /** taxonomy → (term_taxonomy_id → term_id). Lets us go from a post's term
      relationships to the (taxonomy, term) pair. */
  termTaxonomy: Map<number, WpTermTaxonomy>;
  /** post_id → list of term_taxonomy_ids attached to it */
  termRelsByPostId: Map<number, number[]>;
  /** Every wpgmza marker. Transform joins by title (verified 48/48 in step 2). */
  wpgmzaMarkers: WpgmzaMarker[];
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** Treat a column value as a number; throws if it's null or not numeric. */
function toInt(value: string | null, context: string): number {
  if (value == null) throw new Error(`${context}: expected integer, got NULL`);
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${context}: expected integer, got ${JSON.stringify(value)}`);
  return n;
}

/** Treat a column value as a string; coerces null → empty string (mysqldump emits
 *  empty strings for NOT NULL text columns, but we're defensive about it). */
function toStr(value: string | null): string {
  return value ?? "";
}

// ─── Per-table parsers ────────────────────────────────────────────────────────

function* parsePosts(dumpText: string): Generator<WpPost> {
  // wp_posts column order (verified against CREATE TABLE in step 1 inspection):
  //   0 ID, 1 post_author, 2 post_date, 3 post_date_gmt, 4 post_content,
  //   5 post_title, 6 post_excerpt, 7 post_status, 8 comment_status,
  //   9 ping_status, 10 post_password, 11 post_name, 12 to_ping,
  //  13 pinged, 14 post_modified, 15 post_modified_gmt, 16 post_content_filtered,
  //  17 post_parent, 18 guid, 19 menu_order, 20 post_type, 21 post_mime_type,
  //  22 comment_count
  for (const row of iterRows(extractTableValues(dumpText, "wp_posts"))) {
    if (row.length < 23) continue; // defensively skip malformed (shouldn't happen)
    yield {
      id: toInt(row[0] ?? null, "wp_posts.id"),
      postContent: toStr(row[4] ?? null),
      postTitle: toStr(row[5] ?? null),
      postStatus: toStr(row[7] ?? null),
      postName: toStr(row[11] ?? null),
      postType: toStr(row[20] ?? null),
      guid: toStr(row[18] ?? null),
    };
  }
}

function* parseMeta(dumpText: string): Generator<WpMeta> {
  // wp_postmeta columns: 0 meta_id, 1 post_id, 2 meta_key, 3 meta_value
  for (const row of iterRows(extractTableValues(dumpText, "wp_postmeta"))) {
    if (row.length < 4) continue;
    yield {
      postId: toInt(row[1] ?? null, "wp_postmeta.post_id"),
      metaKey: toStr(row[2] ?? null),
      metaValue: row[3] ?? null,
    };
  }
}

function* parseTerms(dumpText: string): Generator<WpTerm> {
  // wp_terms columns: 0 term_id, 1 name, 2 slug, 3 term_group
  for (const row of iterRows(extractTableValues(dumpText, "wp_terms"))) {
    if (row.length < 3) continue;
    yield {
      termId: toInt(row[0] ?? null, "wp_terms.term_id"),
      name: toStr(row[1] ?? null),
      slug: toStr(row[2] ?? null),
    };
  }
}

function* parseTermTaxonomy(dumpText: string): Generator<WpTermTaxonomy> {
  // wp_term_taxonomy columns: 0 term_taxonomy_id, 1 term_id, 2 taxonomy, 3 description, 4 parent, 5 count
  for (const row of iterRows(extractTableValues(dumpText, "wp_term_taxonomy"))) {
    if (row.length < 3) continue;
    yield {
      termTaxonomyId: toInt(row[0] ?? null, "wp_term_taxonomy.term_taxonomy_id"),
      termId: toInt(row[1] ?? null, "wp_term_taxonomy.term_id"),
      taxonomy: toStr(row[2] ?? null),
    };
  }
}

function* parseTermRelationships(dumpText: string): Generator<WpTermRelationship> {
  // wp_term_relationships columns: 0 object_id, 1 term_taxonomy_id, 2 term_order
  for (const row of iterRows(extractTableValues(dumpText, "wp_term_relationships"))) {
    if (row.length < 2) continue;
    yield {
      objectId: toInt(row[0] ?? null, "wp_term_relationships.object_id"),
      termTaxonomyId: toInt(row[1] ?? null, "wp_term_relationships.term_taxonomy_id"),
    };
  }
}

function* parseWpgmza(dumpText: string): Generator<WpgmzaMarker> {
  // wp_wpgmza columns (from CREATE TABLE inspection):
  //   0 id, 1 map_id, 2 address, 3 description, 4 pic, 5 link, 6 icon,
  //   7 lat, 8 lng, 9 anim, 10 title, ...
  for (const row of iterRows(extractTableValues(dumpText, "wp_wpgmza"))) {
    if (row.length < 11) continue;
    yield {
      id: toInt(row[0] ?? null, "wp_wpgmza.id"),
      address: toStr(row[2] ?? null),
      lat: toStr(row[7] ?? null),
      lng: toStr(row[8] ?? null),
      title: toStr(row[10] ?? null),
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read a mysqldump file and build the indexed context the transform layer
 * needs. Pass the absolute path; defaults to the canonical location.
 *
 * Single-pass — the dump is read into memory once and indexed; no streaming.
 * The 2.9 MB WPEngine dump materializes to ~10 MB of JS objects.
 */
export function loadWpContext(dumpPath: string): WpContext {
  const text = readDump(dumpPath);

  const posts = new Map<number, WpPost>();
  const postsByType = new Map<string, WpPost[]>();
  for (const post of parsePosts(text)) {
    posts.set(post.id, post);
    const bucket = postsByType.get(post.postType);
    if (bucket) bucket.push(post);
    else postsByType.set(post.postType, [post]);
  }

  const metaByPostId = new Map<number, WpMeta[]>();
  for (const meta of parseMeta(text)) {
    const bucket = metaByPostId.get(meta.postId);
    if (bucket) bucket.push(meta);
    else metaByPostId.set(meta.postId, [meta]);
  }

  const terms = new Map<number, WpTerm>();
  for (const t of parseTerms(text)) terms.set(t.termId, t);

  const termTaxonomy = new Map<number, WpTermTaxonomy>();
  for (const tt of parseTermTaxonomy(text)) termTaxonomy.set(tt.termTaxonomyId, tt);

  const termRelsByPostId = new Map<number, number[]>();
  for (const rel of parseTermRelationships(text)) {
    const bucket = termRelsByPostId.get(rel.objectId);
    if (bucket) bucket.push(rel.termTaxonomyId);
    else termRelsByPostId.set(rel.objectId, [rel.termTaxonomyId]);
  }

  const wpgmzaMarkers: WpgmzaMarker[] = [];
  for (const m of parseWpgmza(text)) wpgmzaMarkers.push(m);

  return {
    posts,
    postsByType,
    metaByPostId,
    terms,
    termTaxonomy,
    termRelsByPostId,
    wpgmzaMarkers,
  };
}

// ─── Convenience accessors used by the transform layer ───────────────────────

/** All published posts of a given type. */
export function publishedPostsOfType(ctx: WpContext, type: string): WpPost[] {
  return (ctx.postsByType.get(type) ?? []).filter((p) => p.postStatus === "publish");
}

/** Build a `Map<metaKey, metaValue>` for a single post, dropping the leading-underscore
 *  duplicates ACF emits (those are ACF's "field key registration" sidecars). */
export function flatMetaForPost(ctx: WpContext, postId: number): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const rows = ctx.metaByPostId.get(postId) ?? [];
  for (const r of rows) {
    if (r.metaKey.startsWith("_")) continue; // skip ACF field-key sidecars
    out.set(r.metaKey, r.metaValue);
  }
  return out;
}

/** Resolve a post's term_taxonomy_ids to (taxonomy, term) pairs. */
export function termsForPost(
  ctx: WpContext,
  postId: number,
): Array<{ taxonomy: string; term: WpTerm }> {
  const out: Array<{ taxonomy: string; term: WpTerm }> = [];
  const ttids = ctx.termRelsByPostId.get(postId) ?? [];
  for (const ttid of ttids) {
    const tt = ctx.termTaxonomy.get(ttid);
    if (!tt) continue;
    const term = ctx.terms.get(tt.termId);
    if (!term) continue;
    out.push({ taxonomy: tt.taxonomy, term });
  }
  return out;
}

/**
 * Find the wpgmza marker that matches a park's title. Returns null if no
 * marker matches. Matching is case-insensitive substring in either direction —
 * we verified in step 2 that this yields 48/48 unique matches against the
 * real dump. If it ever degrades, the transform layer should warn loudly.
 */
export function wpgmzaForParkTitle(ctx: WpContext, title: string): WpgmzaMarker | null {
  const needle = title.toLowerCase().trim();
  if (!needle) return null;
  for (const m of ctx.wpgmzaMarkers) {
    const cand = m.title.toLowerCase().trim();
    if (!cand) continue;
    if (cand === needle || cand.includes(needle) || needle.includes(cand)) {
      return m;
    }
  }
  return null;
}
