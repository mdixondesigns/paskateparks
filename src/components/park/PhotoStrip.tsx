import { ResponsiveImage } from "./ResponsiveImage";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  parkName: string;
  photos: ParkWithRelations["photos"];
}

// D14 photo strip — horizontally scrollable thumbnails. Tap → lightbox (phase 9
// wires the lightbox modal; phase 4 just renders the strip).
// Hides silently when no photos.
export function PhotoStrip({ parkName, photos }: Props) {
  if (photos.length === 0) return null;

  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label={`${parkName} photo gallery, ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
    >
      <ul className="flex gap-2 py-2" role="list">
        {photos.map((photo, idx) => (
          <li key={photo.id} className="shrink-0">
            <ResponsiveImage
              storagePath={photo.storagePath}
              alt={photo.altText ?? photo.caption ?? `${parkName} photo ${idx + 1}`}
              sizes="120px"
              width={120}
              height={120}
              className="block h-[120px] w-[120px] object-cover"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
