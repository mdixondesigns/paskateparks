// Phase 8 CMT-4A — JSON-LD structured-data helpers for taxonomy archives.
//
// Two schemas used:
//   • ItemList    — names the list of parks on /county/[slug] + /obstacle/[slug]
//   • BreadcrumbList — names the hierarchy Home > <Taxonomy> > <Slug>
//
// Both render as <script type="application/ld+json"> in server-rendered HTML.
// Pure data shape — no React, no client JS. The route embeds the result via
// dangerouslySetInnerHTML.
//
// We intentionally do NOT use a library (schema-dts etc.) — schemas are tiny
// and stable, and adding a dep would be Layer-2 noise for a Layer-3 problem.

import { SITE_NAME, SITE_URL } from "@/lib/site";

export interface ItemListEntry {
  name: string;
  url: string;
}

interface ItemListSchema {
  "@context": "https://schema.org";
  "@type": "ItemList";
  name: string;
  numberOfItems: number;
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    url: string;
  }>;
}

export function itemListJsonLd(name: string, entries: readonly ItemListEntry[]): ItemListSchema {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      url: e.url.startsWith("http") ? e.url : `${SITE_URL}${e.url}`,
    })),
  };
}

export interface BreadcrumbEntry {
  name: string;
  /** Relative path like `/county/bucks` or absolute URL. */
  url: string;
}

interface BreadcrumbListSchema {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
}

export function breadcrumbJsonLd(trail: readonly BreadcrumbEntry[]): BreadcrumbListSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: b.url.startsWith("http") ? b.url : `${SITE_URL}${b.url}`,
    })),
  };
}

/**
 * Canonical breadcrumb root used by every taxonomy archive — pins "Pennsylvania
 * Skateparks" → home as the first breadcrumb entry. Pass the second + third
 * entries from the route.
 */
export const HOME_BREADCRUMB: BreadcrumbEntry = { name: SITE_NAME, url: "/" };
