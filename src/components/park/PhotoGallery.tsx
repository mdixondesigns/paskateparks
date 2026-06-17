"use client";

import { useState } from "react";

import { Lightbox, type LightboxPhoto } from "./Lightbox";
import { ResponsiveImage } from "./ResponsiveImage";

interface Props {
  parkName: string;
  photos: ReadonlyArray<LightboxPhoto>;
}

// D14 photo gallery — horizontally scrollable strip that opens a lightbox
// modal on tap. Replaces the original PhotoStrip (which was inert). State
// (open + current index) lives here; the visible strip + Lightbox are both
// driven from it. Hides silently when no photos.
export function PhotoGallery({ parkName, photos }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isOpen = openIndex !== null;

  if (photos.length === 0) return null;

  return (
    <>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={`${parkName} photo gallery, ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
      >
        <ul className="flex gap-2 py-2" role="list">
          {photos.map((photo, idx) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpenIndex(idx)}
                aria-label={`View photo ${idx + 1} of ${photos.length}`}
                className="block focus:outline-none focus:ring-2 focus:ring-black"
              >
                <ResponsiveImage
                  storagePath={photo.storagePath}
                  alt={photo.altText ?? photo.caption ?? `${parkName} photo ${idx + 1}`}
                  sizes="120px"
                  width={120}
                  height={120}
                  className="block h-[120px] w-[120px] object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
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
