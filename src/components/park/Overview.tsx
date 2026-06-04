import { PhotoStrip } from "./PhotoStrip";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

// Section 5 — overview per D14. Description paragraph + horizontally scrollable
// photo strip. Both individually optional; hides silently when neither is present.
export function Overview({ park }: Props) {
  const hasDescription = park.description && park.description.trim().length > 0;
  const hasPhotos = park.photos.length > 0;
  if (!hasDescription && !hasPhotos) return null;

  return (
    <section aria-labelledby="overview-heading" className="px-4 py-4">
      <h2 id="overview-heading" className="text-xs font-bold uppercase tracking-wider">
        Overview
      </h2>
      {hasDescription ? <p className="mt-2">{park.description}</p> : null}
      {hasPhotos ? (
        <div className="mt-3">
          <PhotoStrip parkName={park.name} photos={park.photos} />
        </div>
      ) : null}
    </section>
  );
}
