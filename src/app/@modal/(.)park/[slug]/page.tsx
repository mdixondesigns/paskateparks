import { ParkProfile } from "@/components/park/ParkProfile";
import { getParkBySlug, parkMetadata } from "@/lib/park-query";

import { ModalShell } from "../../_components/ModalShell";

// Intercepting parallel route — matches /park/<slug> ONLY when reached via a
// client-side navigation from /. Direct hits (refresh, shared link, Googlebot)
// hit the standalone route at src/app/park/[slug]/page.tsx instead.
//
// Server component: fetches the park and passes it to the ModalShell client
// wrapper which owns the <dialog> lifecycle.
//
// Speed optimization (user feedback): the modal SKIPS the nearby parks /
// nearby shops fetches that the standalone page computes. Those add ~3
// extra database round-trips (`getAllParksForNearby` + `getAllShopsForNearby`
// + `getHeroPhotoFor`) plus the in-memory `findNearby` pass, which made the
// modal feel sluggish (1-2s in dev with the "rendering" indicator visible).
// `NearbyParks` and `NearbyShops` both return null on an empty items array,
// so passing `[]` cleanly hides those two sections inside the modal while
// the standalone /park/<slug> page (direct hits, refresh, share links)
// keeps the full 16-section experience including nearby.

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

  return (
    <ModalShell parkName={park.name}>
      <ParkProfile park={park} nearbyParks={[]} nearbyShops={[]} />
    </ModalShell>
  );
}
