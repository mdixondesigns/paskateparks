// Retired /builder/<slug>/ and /shop/<slug>/ URLs (D3, locked phase 9 6A).
//
// All 14 builder + 19 published shop + 3 draft shop slugs from the WP export
// at data/wp-export/mysql.sql (captured during phase 5 migration). SITE-AUDIT.md
// §5 reported 14 + 20 = 34; the actual extract is 14 + 22 = 36 because three
// shops were in `draft` status at export time and may have been briefly
// publicly accessible before being unpublished. Defensive include — the cost
// of a wrong 410 is zero, the cost of a missed 410 is a stale crawler.
//
// If a slug shows up later that's not here, add it manually — the brief
// explicitly chose hardcoded over dynamic generation (CMT-8 outside voice
// argued for generation; D3 + 6A locked the hardcode pattern). The Sets
// give O(1) lookup in middleware.ts.

export const RETIRED_BUILDER_SLUGS: ReadonlySet<string> = new Set([
  "5th-pocket-skateparks",
  "arment-concrete",
  "bk-designs-skateparks",
  "david-hornung-architect-planner-inc",
  "diy",
  "grindline-skateparks",
  "heidelberg-cement-group",
  "ignition-skate-shop",
  "landscape-structures-skatewave",
  "misiano-skatepark-designs",
  "pat-bodor",
  "site-design-group-inc",
  "spohn-ranch-skateparks",
  "tom-martyn",
]);

export const RETIRED_SHOP_SLUGS: ReadonlySet<string> = new Set([
  // 19 published at WP export
  "bazaar-skate-shop",
  "boyertown-skate-shop",
  "dogwood-skate-shop",
  "exist-skate-shop",
  "flatbar-skate-shop",
  "funtastik-skate-and-snowboard-shop",
  "gonzo-skate",
  "holistic-skateshop",
  "homebase610",
  "ignition-skateshop",
  "iq-skateshop",
  "loweriders-bikes-and-boards",
  "nocturnal",
  "nomad-supply-co",
  "one-up-skate-shop",
  "plank-eye-board-shop",
  "radio-skateshop",
  "union-skate",
  "zembo-temple-of-skate-design",
  // 3 draft at WP export — defensive include (may have been briefly public)
  "3-way-street-skate-shop",
  "skate-the-foundry",
  "timber-skate-shop",
]);

/**
 * Returns true when the pathname matches a retired /builder/<slug> or
 * /shop/<slug> URL — whether the slug is in the audited list or not.
 *
 * Per D3 + 6A: ALL /builder/* and /shop/* paths return 410 (even unknown
 * slugs), because the entire post type is retired, not just specific posts.
 * The Sets above are documentation of the slugs we know Google has indexed
 * — they're not used to filter the middleware's matcher.
 *
 * Middleware uses isRetiredBuilderOrShopPath(pathname) to decide whether to
 * emit 410. The Sets are exported for tests + the orphan-county lint chip
 * (future use).
 */
export function isRetiredBuilderOrShopPath(pathname: string): boolean {
  // Strip query string and trailing slash for the comparison.
  const cleanPath = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return cleanPath.startsWith("/builder/") || cleanPath.startsWith("/shop/")
    || cleanPath === "/builder" || cleanPath === "/shop";
}
