import { ResponsiveImage } from "./ResponsiveImage";
import { ridingSurfaceLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

// Section 8 — riding surface per D20. Multi-select + Notes + Photo.
// Hides silently when surfaces array is empty AND no notes AND no photo.
export function RidingSurface({ park }: Props) {
  const hasSurfaces = park.surfaces.length > 0;
  const hasNotes = park.ridingSurfaceNotes && park.ridingSurfaceNotes.trim().length > 0;
  const hasPhoto = park.ridingSurfacePhotoPath && park.ridingSurfacePhotoPath.trim().length > 0;
  if (!hasSurfaces && !hasNotes && !hasPhoto) return null;

  return (
    <section aria-labelledby="surface-heading" className="px-4 py-4">
      <h2 id="surface-heading" className="text-xs font-bold uppercase tracking-wider">
        Riding surface
      </h2>
      {hasSurfaces ? (
        <ul role="list" className="mt-2 flex flex-wrap gap-2">
          {park.surfaces.map((s) => (
            <li key={s} className="rounded border px-2 py-0.5 text-sm">
              {ridingSurfaceLabel[s]}
            </li>
          ))}
        </ul>
      ) : null}
      {hasNotes ? <p className="mt-2 text-sm italic">{park.ridingSurfaceNotes}</p> : null}
      {hasPhoto ? (
        <div className="mt-2">
          <ResponsiveImage
            storagePath={park.ridingSurfacePhotoPath!}
            alt="Riding surface detail"
            sizes="200px"
            width={200}
            height={150}
            className="block w-[200px]"
          />
        </div>
      ) : null}
    </section>
  );
}
