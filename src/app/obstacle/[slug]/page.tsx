import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/site/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { NearbyCard, type NearbyCardItem } from "@/components/park/NearbyCard";
import { HOME_BREADCRUMB, itemListJsonLd } from "@/lib/json-ld";
import { obstacleForSlug, obstacleLabel, obstacleSlug } from "@/lib/labels";
import {
  getObstaclesWithOpenParks,
  getParksByObstacle,
} from "@/lib/park-query";
import { SITE_URL } from "@/lib/site";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Phase 8 CMT-1A — same dynamicParams pattern as /county/[slug]. Unknown
// slugs return Next's built-in 404 at the routing layer.
export const dynamicParams = false;

// Phase 8 D4 — only emit slugs for obstacles tagged on ≥1 open park. Phase-9
// webhook revalidation rebuilds when park_obstacles row INSERT/DELETE or
// parks.status changes.
export async function generateStaticParams() {
  const obstacles = await getObstaclesWithOpenParks();
  return obstacles.map((obstacle) => ({ slug: obstacleSlug(obstacle) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const obstacle = obstacleForSlug(slug);
  if (!obstacle) return { title: "Not found" };

  const label = obstacleLabel[obstacle];
  const parks = await getParksByObstacle(obstacle);
  const count = parks.length;
  // First 3 park names for the description so the snippet shows concrete
  // examples rather than just a count.
  const names = parks.slice(0, 3).map((p) => p.name);
  const namesText =
    names.length > 0 ? ` Featured: ${names.join(", ")}.` : "";

  return {
    title: `${label} Spots in PA Skateparks — Pennsylvania Skateparks`,
    description: `${count} Pennsylvania skatepark${count === 1 ? "" : "s"} with ${label.toLowerCase()} obstacles.${namesText}`,
    alternates: {
      canonical: `${SITE_URL}/obstacle/${slug}`,
    },
  };
}

export default async function ObstacleArchivePage({ params }: PageProps) {
  const { slug } = await params;
  const obstacle = obstacleForSlug(slug);
  if (!obstacle) notFound();

  const label = obstacleLabel[obstacle];
  const parks = await getParksByObstacle(obstacle);
  // Race: obstacle had open parks at build, last one closed before request.
  if (parks.length === 0) notFound();

  const itemList = itemListJsonLd(
    `PA skateparks with ${label} obstacles`,
    parks.map((p) => ({ name: p.name, url: `/park/${p.slug}` })),
  );
  const breadcrumbTrail = [
    HOME_BREADCRUMB,
    { name: `${label} Spots`, url: `/obstacle/${slug}` },
  ];

  const items: NearbyCardItem[] = parks.map((p) => ({
    name: p.name,
    city: p.city,
    state: p.state,
    href: `/park/${p.slug}`,
    thumbStoragePath: p.heroPhotoPath,
  }));

  const count = parks.length;
  const noun = count === 1 ? "Pennsylvania skatepark" : "Pennsylvania skateparks";

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-6">
      <JsonLd data={itemList} />
      <Breadcrumb trail={breadcrumbTrail} />

      <h1 className="mt-4 text-2xl font-bold">{label} Spots in PA Skateparks</h1>

      <p className="mt-2 text-sm">
        {count} {noun} with {label.toLowerCase()} obstacles, sorted alphabetically.
      </p>

      <ul role="list" className="mt-4 border-y">
        {items.map((item) => (
          <NearbyCard key={item.href ?? item.name} item={item} />
        ))}
      </ul>
    </main>
  );
}
