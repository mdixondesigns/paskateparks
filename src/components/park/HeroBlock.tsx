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
  // Prefer a purpose-shot panorama (parks.hero_photo_path); fall back to the
  // first gallery photo, which is also the map marker/popup thumbnail. When a
  // dedicated panorama is set it carries no caption/credit of its own, so the
  // alt is the generic hero label; the fallback keeps the gallery photo's alt.
  const galleryLead = park.photos[0];
  const heroStoragePath = park.heroPhotoPath ?? galleryLead?.storagePath ?? null;
  const heroAlt = park.heroPhotoPath
    ? `${park.name} hero photo`
    : (galleryLead?.altText ?? galleryLead?.caption ?? `${park.name} hero photo`);
  const renovationYears = park.renovations.map((r) => r.year);

  return (
    <header className="px-4 py-6">
      {heroStoragePath ? (
        <ResponsiveImage
          storagePath={heroStoragePath}
          alt={heroAlt}
          sizes="(max-width: 768px) 100vw, 720px"
          loading="eager"
          fetchPriority="high"
          // Lock the hero to a fixed landscape box so a portrait source can't
          // blow the height out and push the profile down: 3:2 on mobile, 16:9
          // (1920x1080) on desktop. object-cover crops the source to fit.
          className="mb-4 block aspect-[3/2] w-full object-cover md:aspect-video"
        />
      ) : null}
      <p className="text-sm uppercase tracking-wider">
        {park.city}, {park.state}
      </p>
      <h1 className="mt-1 text-3xl font-bold">{park.name}</h1>
      {park.alias ? (
        <p className="mt-1 text-sm italic text-neutral-600">Also known as {park.alias}</p>
      ) : null}
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
