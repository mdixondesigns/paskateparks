"use client";

import { useState, type ReactNode } from "react";

import { Lightbox, type LightboxPhoto } from "./Lightbox";
import { ResponsiveImage } from "./ResponsiveImage";

interface Props {
  parkName: string;
  photos: ReadonlyArray<LightboxPhoto>;
}

// D14 photo gallery — an Airbnb-style collage: a large hero tile plus a grid of
// smaller ones, capped at MAX_VISIBLE. Tapping any tile opens the Lightbox at
// that photo; when the set is larger than the collage, the last tile carries a
// "+N more" scrim that opens the Lightbox so the full set is still reachable.
// Replaces the original horizontal-scroll strip (bad on desktop). Every tile is
// a square crop — we don't store per-photo dimensions, so a justified/masonry
// layout isn't possible without a backfill. Hides silently when no photos.
const MAX_VISIBLE = 5;

// One clickable photo. Fills its grid cell via aspect + object-cover crop. When
// `overflowCount` is set this is the last visible tile: it shows the "+N" scrim
// and reads as "Show all N photos" to assistive tech.
function GalleryTile({
  photo,
  index,
  total,
  parkName,
  onOpen,
  className = "aspect-square",
  overflowCount,
}: {
  photo: LightboxPhoto;
  index: number;
  total: number;
  parkName: string;
  onOpen: (index: number) => void;
  className?: string;
  overflowCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={
        overflowCount ? `Show all ${total} photos` : `View photo ${index + 1} of ${total}`
      }
      className={`group relative block min-w-0 overflow-hidden focus:outline-none focus:ring-2 focus:ring-black ${className}`}
    >
      <ResponsiveImage
        storagePath={photo.storagePath}
        alt={photo.altText ?? photo.caption ?? `${parkName} photo ${index + 1}`}
        sizes="(min-width: 640px) 25vw, 50vw"
        width={600}
        height={600}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
      {overflowCount ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white"
        >
          +{overflowCount} more
        </span>
      ) : null}
    </button>
  );
}

export function PhotoGallery({ parkName, photos }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isOpen = openIndex !== null;

  if (photos.length === 0) return null;

  const total = photos.length;
  const overflow = total - MAX_VISIBLE; // > 0 → last visible tile gets "+N more"

  const tile = (i: number, className?: string, isOverflow = false) => (
    <GalleryTile
      key={photos[i]!.id}
      photo={photos[i]!}
      index={i}
      total={total}
      parkName={parkName}
      onOpen={setOpenIndex}
      className={className}
      overflowCount={isOverflow && overflow > 0 ? overflow : undefined}
    />
  );

  // Collage shape by count. The hero (first photo) spans 2x2 once there are 3+
  // photos; smaller sets degrade to sensible fixed layouts.
  let grid: ReactNode;
  if (total === 1) {
    grid = <div className="grid">{tile(0, "aspect-[16/9]")}</div>;
  } else if (total === 2) {
    grid = <div className="grid grid-cols-2 gap-2">{[tile(0), tile(1)]}</div>;
  } else if (total === 3) {
    grid = (
      <div className="grid grid-cols-3 grid-rows-2 gap-2">
        {tile(0, "col-span-2 row-span-2")}
        {tile(1)}
        {tile(2)}
      </div>
    );
  } else {
    // 4+ — hero (2x2) + up to 4 small tiles in a 4-col / 2-row collage. With
    // exactly 4 photos only 3 small tiles render, so the bottom-right cell is
    // intentionally left empty (looks more dynamic than a flat 2x2 quad). The
    // 5th tile carries "+N more" when total > 5. Mobile stacks (hero full width,
    // then the tiles below); sm+ is the hero-left grid.
    const rest = [1, 2, 3, 4].filter((i) => i < total);
    grid = (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:grid-rows-2">
        {tile(0, "col-span-2 row-span-2")}
        {rest.map((i) => tile(i, undefined, i === 4))}
      </div>
    );
  }

  return (
    <>
      <div
        role="region"
        aria-label={`${parkName} photo gallery, ${total} ${total === 1 ? "photo" : "photos"}`}
      >
        {grid}
      </div>

      <Lightbox
        open={isOpen}
        parkName={parkName}
        photos={photos}
        index={openIndex ?? 0}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
