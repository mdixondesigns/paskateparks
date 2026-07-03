import type { ParkWithRelations } from "@/lib/park-query";

import { DirectionsLink } from "./DirectionsLink";

interface Props {
  park: ParkWithRelations;
}

// Section 3 — address per D12. Structured street + city + state + zip, plus
// a Get Directions link when lat/lng are present.
// Hides silently if neither address fields nor coords are present.
export function AddressRow({ park }: Props) {
  const hasAddress =
    park.streetAddress || park.city || park.zip || (park.lat != null && park.lng != null);
  if (!hasAddress) return null;

  const cityState = [park.city, park.state].filter(Boolean).join(", ");
  const fullAddress = [park.streetAddress, cityState, park.zip].filter(Boolean).join(", ");

  return (
    <section aria-labelledby="address-heading" className="px-4 py-4">
      <h2 id="address-heading" className="text-xs font-bold tracking-wider uppercase">
        Address
      </h2>
      <address className="mt-2 not-italic">
        {park.streetAddress ? <div>{park.streetAddress}</div> : null}
        <div>{cityState}</div>
        {park.zip ? <div>{park.zip}</div> : null}
      </address>
      {park.lat != null && park.lng != null ? (
        <p className="mt-2">
          <DirectionsLink
            parkName={park.name}
            lat={park.lat}
            lng={park.lng}
            fullAddress={fullAddress}
          />
        </p>
      ) : null}
    </section>
  );
}
