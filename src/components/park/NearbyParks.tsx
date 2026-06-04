import { NearbyCard, type NearbyCardItem } from "./NearbyCard";

interface Props {
  items: NearbyCardItem[];
}

// Section 15 — Nearby Parks per D24. Top 3 within 30mi computed at build time.
// Hides silently when none in range.
export function NearbyParks({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="nearby-parks-heading" className="px-4 py-4">
      <h2
        id="nearby-parks-heading"
        className="text-xs font-bold uppercase tracking-wider"
      >
        Nearby parks
      </h2>
      <ul role="list" className="mt-2 border-y">
        {items.map((item, idx) => (
          <NearbyCard key={`${item.href ?? item.name}-${idx}`} item={item} />
        ))}
      </ul>
    </section>
  );
}
