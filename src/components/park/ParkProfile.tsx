import { AddressRow } from "./AddressRow";
import { AmenitiesGrid } from "./AmenitiesGrid";
import { Builders } from "./Builders";
import { ConnectSection } from "./ConnectSection";
import { HeroBlock } from "./HeroBlock";
import { HoursStanzas } from "./HoursStanzas";
import { NearbyParks } from "./NearbyParks";
import { NearbyShops } from "./NearbyShops";
import { Obstacles } from "./Obstacles";
import { Overview } from "./Overview";
import { ParkRules } from "./ParkRules";
import { ProgrammingModule } from "./ProgrammingModule";
import { RidingSurface } from "./RidingSurface";
import { StatusBanner } from "./StatusBanner";
import { SuggestEditButton } from "./SuggestEditButton";
import { SupportSection } from "./SupportSection";

import type { ParkWithRelations } from "@/lib/park-query";
import type { NearbyCardItem } from "./NearbyCard";

interface Props {
  park: ParkWithRelations;
  nearbyParks: NearbyCardItem[];
  nearbyShops: NearbyCardItem[];
}

// Orchestrator for the 16-section profile per DESIGN.md "Visual order on the profile".
// Section order is canonical and matches the locked decisions D9–D28:
//   1.  Hero
//   2.  Status banner (conditional on D11)
//   3.  Address
//   4.  Hours
//   5.  Overview (description + photo strip)
//   6.  Park rules
//   7.  Amenities (7 rows)
//   8.  Riding surface
//   9.  Programming (conditional on D27)
//  10.  Obstacles
//  11.  Builders
//  12.  Connect
//  13.  Support
//  14.  Suggest an Edit
//  15.  Nearby parks
//  16.  Nearby shops
//
// All sections handle empty data by rendering null — see each component for
// the specific "hides silently when X is empty" rule.
export function ParkProfile({ park, nearbyParks, nearbyShops }: Props) {
  return (
    <article aria-labelledby="park-name">
      {/* The H1 lives inside HeroBlock; aria-labelledby points at its id. */}
      <span id="park-name" className="sr-only">
        {park.name}
      </span>

      <HeroBlock park={park} />
      <StatusBanner status={park.status} reopenExpectedAt={park.reopenExpectedAt} />
      <AddressRow park={park} />
      <HoursStanzas hours={park.hours} />
      <Overview park={park} />
      <ParkRules park={park} />
      <AmenitiesGrid amenities={park.amenities} />
      <RidingSurface park={park} />
      {park.programming ? <ProgrammingModule parkCity={park.city} /> : null}
      <Obstacles obstacles={park.obstacles} />
      <Builders builders={park.builders} />
      <ConnectSection links={park.links} />
      <SupportSection links={park.links} />
      {park.status === "permanently_closed" ? null : (
        <SuggestEditButton parkId={park.id} parkSlug={park.slug} parkName={park.name} />
      )}
      <NearbyParks items={nearbyParks} />
      <NearbyShops items={nearbyShops} />
    </article>
  );
}
