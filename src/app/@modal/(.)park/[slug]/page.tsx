import { ParkProfile } from "@/components/park/ParkProfile";
import type { NearbyCardItem } from "@/components/park/NearbyCard";
import {
  getAllParksForNearby,
  getAllShopsForNearby,
  getHeroPhotoFor,
  getParkBySlug,
  parkMetadata,
} from "@/lib/park-query";
import { findNearby } from "@/lib/nearby";

import { ModalShell } from "../../_components/ModalShell";

// Intercepting parallel route — matches /park/<slug> ONLY when reached via a
// client-side navigation from /. Direct hits (refresh, shared link, Googlebot)
// hit the standalone route at src/app/park/[slug]/page.tsx instead.
//
// Server component: fetches the park + nearby data; passes everything to the
// ModalShell client wrapper which owns the <dialog> lifecycle. Mirrors the
// standalone page's data-fetch contract so ParkProfile renders identically
// in both surfaces.

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Per eng-review D3, both routes share the same metadata source. Without an
// exported generateMetadata here, Next would apply the homepage's metadata
// while the modal is open and the tab title would never reflect the open park.
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return parkMetadata(slug);
}

export default async function ParkModalPage({ params }: PageProps) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);

  // Per plan: do NOT call Next's notFound() here — it would 404 the entire
  // homepage shell beneath the modal. Render the not-found state inside the
  // dialog so the homepage stays mounted; the standalone route handles the
  // direct-hit 404 path.
  if (!park) {
    return <ModalShell parkName="Park not found" notFound />;
  }

  // Same nearby-data shape as the standalone page so ParkProfile renders the
  // full 16 sections (D6.4 — locked: ship the full profile in the modal).
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

  return (
    <ModalShell parkName={park.name}>
      <ParkProfile
        park={park}
        nearbyParks={nearbyParkItems}
        nearbyShops={nearbyShopItems}
      />
    </ModalShell>
  );
}
