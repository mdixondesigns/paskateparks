import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

// Section 3 — address per D12. Structured street + city + state + zip, plus
// a Get Directions link when lat/lng are present.
// Hides silently if neither address fields nor coords are present.
//
// TODO (TODOS.md P1): iOS vs Android directions deep-link handling — phase 7
// when we build the map. For now, `geo:` URI works on Android; iOS fallback
// goes to Apple Maps via https://maps.apple.com/?ll=.
export function AddressRow({ park }: Props) {
  const hasAddress =
    park.streetAddress || park.city || park.zip || (park.lat != null && park.lng != null);
  if (!hasAddress) return null;

  const cityState = [park.city, park.state].filter(Boolean).join(", ");
  const fullAddress = [park.streetAddress, cityState, park.zip].filter(Boolean).join(", ");

  return (
    <section aria-labelledby="address-heading" className="px-4 py-4">
      <h2 id="address-heading" className="text-xs font-bold uppercase tracking-wider">
        Address
      </h2>
      <address className="mt-2 not-italic">
        {park.streetAddress ? <div>{park.streetAddress}</div> : null}
        <div>{cityState}</div>
        {park.zip ? <div>{park.zip}</div> : null}
      </address>
      {park.lat != null && park.lng != null ? (
        <p className="mt-2">
          <a
            href={`https://maps.apple.com/?q=${encodeURIComponent(park.name)}&ll=${park.lat},${park.lng}`}
            rel="noopener noreferrer"
            target="_blank"
            aria-label={`Get directions to ${fullAddress} (opens in your maps app)`}
          >
            Get directions →
          </a>
        </p>
      ) : null}
    </section>
  );
}
