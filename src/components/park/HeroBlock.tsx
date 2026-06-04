import { ResponsiveImage } from "./ResponsiveImage";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

// Section 1 — hero. Photo (first park_photos by sort_order) + city/state eyebrow
// + park name (H1, the only one on the page) + EST year pill + renovated tag.
// Per D9 the hero contains photo + city/state + name + established year only.
// Visual styling is deferred per A6 — semantic structure is set up so VISUAL-DESIGN.md
// §16 can attach the dark band + photo treatment later.
export function HeroBlock({ park }: Props) {
  const heroPhoto = park.photos[0];
  const renovationYears = park.renovations.map((r) => r.year);

  return (
    <header className="px-4 py-6">
      {heroPhoto ? (
        <ResponsiveImage
          storagePath={heroPhoto.storagePath}
          alt={heroPhoto.altText ?? heroPhoto.caption ?? `${park.name} hero photo`}
          sizes="(max-width: 768px) 100vw, 720px"
          loading="eager"
          fetchPriority="high"
          className="mb-4 block w-full"
        />
      ) : null}
      <p className="text-sm uppercase tracking-wider">
        {park.city}, {park.state}
      </p>
      <h1 className="mt-1 text-3xl font-bold">{park.name}</h1>
      <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm">
        {park.establishedYear ? (
          <span aria-label={`Established ${park.establishedYear}`}>
            EST. {park.establishedYear}
          </span>
        ) : null}
        {renovationYears.length > 0 ? (
          <span aria-label={`Renovated in ${renovationYears.join(", ")}`}>
            Renovated {renovationYears.join(", ")}
          </span>
        ) : null}
      </div>
    </header>
  );
}
