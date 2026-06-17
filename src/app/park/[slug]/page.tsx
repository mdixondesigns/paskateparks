import { notFound } from "next/navigation";

import { ParkProfile } from "@/components/park/ParkProfile";
import type { NearbyCardItem } from "@/components/park/NearbyCard";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { db } from "@/db/client";
import { parks } from "@/db/schema";
import { slugForCounty } from "@/lib/counties";
import { HOME_BREADCRUMB, type BreadcrumbEntry } from "@/lib/json-ld";
import {
  getAllParksForNearby,
  getAllShopsForNearby,
  getHeroPhotoFor,
  getParkBySlug,
} from "@/lib/park-query";
import { findNearby } from "@/lib/nearby";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// generateStaticParams reads every parks.slug at build time. The whole list
// is pre-rendered as static HTML; webhooks (phase 9 /api/revalidate) rebuild
// individual pages when Studio rows change.
export async function generateStaticParams() {
  const rows = await db.select({ slug: parks.slug }).from(parks);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return { title: "Park not found" };
  return {
    title: `${park.name} — Pennsylvania Skateparks`,
    description:
      park.description?.slice(0, 160) ??
      `Skatepark in ${park.city}, ${park.state}. Park rules, amenities, photos, and directions.`,
  };
}

export default async function ParkPage({ params }: PageProps) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) notFound();

  // Nearby parks/shops computed at build time per D24 / D5 / D7.
  // 3 closest within 30 miles, no state border rule for shops.
  let nearbyParkItems: NearbyCardItem[] = [];
  let nearbyShopItems: NearbyCardItem[] = [];

  if (park.lat != null && park.lng != null) {
    const origin = { lat: park.lat, lng: park.lng };
    const [allParks, allShops] = await Promise.all([
      getAllParksForNearby(park.id),
      getAllShopsForNearby(),
    ]);
    const np = findNearby(origin, allParks, { limit: 3, maxMiles: 30 });
    const ns = findNearby(origin, allShops, { limit: 3, maxMiles: 30 });
    const heroPhotos = await getHeroPhotoFor(np.map((p) => p.id));
    nearbyParkItems = np.map((p) => ({
      name: p.name,
      city: p.city,
      state: p.state,
      distanceMiles: p.distanceMiles,
      href: `/park/${p.slug}`,
      thumbStoragePath: heroPhotos.get(p.id) ?? null,
    }));
    nearbyShopItems = ns.map((s) => ({
      name: s.name,
      city: null,
      state: s.state,
      distanceMiles: s.distanceMiles,
      href: s.url ?? null,
      thumbStoragePath: null,
    }));
  }

  // Canonical hierarchy for JSON-LD (always 3 levels when county exists, else
  // 2). Visible trail drops the park name via hideCurrent — the H1 inside
  // ParkProfile already names the park, so the breadcrumb just shows where
  // the user came from.
  const countySlug = park.county ? slugForCounty(park.county) : undefined;
  const breadcrumbTrail: BreadcrumbEntry[] = [HOME_BREADCRUMB];
  if (park.county && countySlug) {
    breadcrumbTrail.push({
      name: `${park.county} County`,
      url: `/county/${countySlug}`,
    });
  }
  breadcrumbTrail.push({ name: park.name, url: `/park/${park.slug}` });

  return (
    <main id="main" className="mx-auto max-w-2xl">
      <div className="px-4 pt-6">
        <Breadcrumb trail={breadcrumbTrail} hideCurrent />
      </div>
      <ParkProfile park={park} nearbyParks={nearbyParkItems} nearbyShops={nearbyShopItems} />
    </main>
  );
}
