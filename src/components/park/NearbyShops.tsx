import { NearbyCard, type NearbyCardItem } from "./NearbyCard";

interface Props {
  items: NearbyCardItem[];
}

// Section 16 — Nearby Shops per D5/D7. Top 3 within 30mi, no state border rule.
// Hides silently when none in range.
export function NearbyShops({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="nearby-shops-heading" className="px-4 py-4">
      <h2
        id="nearby-shops-heading"
        className="text-xs font-bold uppercase tracking-wider"
      >
        Nearby skate shops
      </h2>
      <ul role="list" className="mt-2 border-y">
        {items.map((item, idx) => (
          <NearbyCard key={`${item.href ?? item.name}-${idx}`} item={item} />
        ))}
      </ul>
    </section>
  );
}
