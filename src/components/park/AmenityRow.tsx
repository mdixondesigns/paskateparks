import { ResponsiveImage } from "./ResponsiveImage";
import { amenityLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  amenity: ParkWithRelations["amenities"][number];
}

// D18 amenity row — present (Y/N) + Notes + Photo. All three optional independently:
// e.g. "no onsite shop, but there's a great one nearby — here's a photo" is a valid
// row state per TEST-PLAN.md edge cases.
export function AmenityRow({ amenity }: Props) {
  const label = amenityLabel[amenity.type];
  const statusLabel = amenity.present ? "Available" : "Not available";

  return (
    <li className="border-t py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span aria-label={`${label}: ${statusLabel}`} data-present={amenity.present}>
          {amenity.present ? "✓ Yes" : "—"}
        </span>
      </div>
      {amenity.notes ? <p className="mt-1 text-sm italic">{amenity.notes}</p> : null}
      {amenity.photoPath ? (
        <div className="mt-2">
          <ResponsiveImage
            storagePath={amenity.photoPath}
            alt={`${label} at this park`}
            sizes="120px"
            width={120}
            height={90}
            className="block h-[90px] w-[120px] object-cover"
          />
        </div>
      ) : null}
    </li>
  );
}
