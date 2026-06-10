import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/JsonLd";
import { NearbyCard, type NearbyCardItem } from "@/components/park/NearbyCard";
import { COUNTIES, assertCountiesInData, countyForSlug } from "@/lib/counties";
import {
  HOME_BREADCRUMB,
  breadcrumbJsonLd,
  itemListJsonLd,
} from "@/lib/json-ld";
import {
  getCountiesWithOpenParks,
  getParksByCounty,
} from "@/lib/park-query";
import { SITE_URL } from "@/lib/site";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Phase 8 CMT-1A — dynamicParams=false makes unknown slugs short-circuit to
// Next's built-in 404 at the routing layer, no page function execution, no
// DB hit. The `if (!data) notFound()` inside the page is belt+suspenders for
// the race where a taxonomy went empty between build and request (closed
// during webhook revalidation window).
export const dynamicParams = false;

// Phase 8 D4 + CMT-1A — generateStaticParams only emits slugs for counties
// that have ≥1 open park RIGHT NOW. Empty counties are dropped from the
// static set; they 404 at the routing layer rather than rendering a thin
// "0 parks" page. Phase-9 webhook revalidation rebuilds these routes when
// parks transition open/closed, surfacing or removing taxonomies as needed.
//
// The build-time assertCountiesInData call catches Studio drift: if any
// parks.county value isn't in src/lib/counties.ts, the build fails loudly
// before deploy (locked 2A + codex #12). Runs at static-param generation,
// NOT per-page render — a content typo can't become a 500 at request time.
export async function generateStaticParams() {
  const counties = await getCountiesWithOpenParks();
  assertCountiesInData(counties);
  const params: { slug: string }[] = [];
  for (const displayName of counties) {
    const county = COUNTIES.find(
      (c) => c.displayName.toLowerCase() === displayName.toLowerCase(),
    );
    // assertCountiesInData above already throws on unknowns, so this find
    // should always succeed. Defensive check to keep the return shape clean.
    if (county) params.push({ slug: county.slug });
  }
  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const county = countyForSlug(slug);
  if (!county) return { title: "Not found" };

  const parks = await getParksByCounty(county.displayName);
  const count = parks.length;
  // Top 3 city names for the description, deduped, preserving alpha-by-park
  // order so the snippet feels naturally ordered to a search-results reader.
  const cities = Array.from(new Set(parks.map((p) => p.city))).slice(0, 3);
  const citiesText = cities.length > 0 ? ` Includes parks in ${cities.join(", ")}.` : "";

  return {
    title: `Skateparks in ${county.displayName} County, PA — Pennsylvania Skateparks`,
    description: `${count} open skatepark${count === 1 ? "" : "s"} in ${county.displayName} County, Pennsylvania.${citiesText}`,
    alternates: {
      canonical: `${SITE_URL}/county/${county.slug}`,
    },
  };
}

export default async function CountyArchivePage({ params }: PageProps) {
  const { slug } = await params;
  const county = countyForSlug(slug);
  // Belt+suspenders: dynamicParams=false handles unknown slugs at the routing
  // layer, but this guard covers a race where the slug was just removed from
  // the static set by a revalidation that hasn't fully propagated.
  if (!county) notFound();

  const parks = await getParksByCounty(county.displayName);
  // Same race: county had open parks at build, last one closed before request.
  if (parks.length === 0) notFound();

  const itemList = itemListJsonLd(
    `Skateparks in ${county.displayName} County, Pennsylvania`,
    parks.map((p) => ({ name: p.name, url: `/park/${p.slug}` })),
  );
  const breadcrumb = breadcrumbJsonLd([
    HOME_BREADCRUMB,
    { name: `${county.displayName} County`, url: `/county/${county.slug}` },
  ]);

  const items: NearbyCardItem[] = parks.map((p) => ({
    name: p.name,
    city: p.city,
    state: p.state,
    href: `/park/${p.slug}`,
    thumbStoragePath: p.heroPhotoPath,
  }));

  const count = parks.length;
  const noun = count === 1 ? "open skatepark" : "open skateparks";

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-6">
      <JsonLd data={itemList} />
      <JsonLd data={breadcrumb} />

      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/" className="underline">
          Pennsylvania Skateparks
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{county.displayName} County</span>
      </nav>

      <h1 className="mt-4 text-2xl font-bold">
        Skateparks in {county.displayName} County, PA
      </h1>

      <p className="mt-2 text-sm">
        {count} {noun} in {county.displayName} County, Pennsylvania, sorted
        alphabetically.
      </p>

      <ul role="list" className="mt-4 border-y">
        {items.map((item) => (
          <NearbyCard key={item.href ?? item.name} item={item} />
        ))}
      </ul>
    </main>
  );
}
