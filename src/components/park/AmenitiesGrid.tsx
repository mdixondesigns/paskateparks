import { AmenityRow } from "./AmenityRow";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  amenities: ParkWithRelations["amenities"];
}

// Section 7 — amenities per D18. Hides silently when no amenity rows.
// Renders rows in a stable canonical order so the same park always shows the
// same order across pages.
const ORDER = [
  "bathroom",
  "drinking_water",
  "lights",
  "parking",
  "spectator_area",
  "onsite_shop",
  "equipment_rentals",
] as const;

export function AmenitiesGrid({ amenities }: Props) {
  if (amenities.length === 0) return null;

  const sorted = [...amenities].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type),
  );

  return (
    <section aria-labelledby="amenities-heading" className="px-4 py-4">
      <h2 id="amenities-heading" className="text-xs font-bold uppercase tracking-wider">
        Amenities
      </h2>
      <ul role="list" className="mt-2">
        {sorted.map((a) => (
          <AmenityRow key={a.type} amenity={a} />
        ))}
      </ul>
    </section>
  );
}
