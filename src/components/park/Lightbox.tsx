"use client";

import { useCallback, useEffect, useRef } from "react";

import { ResponsiveImage, buildPhotoUrl } from "./ResponsiveImage";

export interface LightboxPhoto {
  id: number;
  storagePath: string;
  caption: string | null;
  credit: string | null;
  altText: string | null;
}

interface Props {
  open: boolean;
  parkName: string;
  photos: ReadonlyArray<LightboxPhoto>;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}

const SWIPE_MIN_X = 50;
const SWIPE_MAX_Y = 80;
const SWIPE_MAX_MS = 500;

export function Lightbox({ open, parkName, photos, index, onIndexChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const count = photos.length;

  // Drive the native <dialog> open/close lifecycle from the `open` prop.
  // showModal() unlocks focus trap, ESC handling, scroll lock, modal stacking.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    onIndexChange((index - 1 + count) % count);
  }, [count, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (count < 2) return;
    onIndexChange((index + 1) % count);
  }, [count, index, onIndexChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  };

  // <dialog>'s "close" event fires for ESC AND for explicit dlg.close() calls.
  // We only call props.onClose so the parent can drop the open state to false.
  const handleDialogClose = () => {
    onClose();
  };

  // Click on the dialog element itself (the backdrop area) closes; clicks on
  // the inner content do not bubble to the dialog because we stopPropagation
  // on the content wrapper.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    if (!end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > SWIPE_MAX_MS) return;
    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < SWIPE_MIN_X) return;
    if (dx > 0) goPrev();
    else goNext();
  };

  const current = photos[index];
  if (!current) return null;

  const altFallback = current.altText ?? current.caption ?? `${parkName} photo ${index + 1}`;
  const hasNav = count > 1;
  const prevIdx = hasNav ? (index - 1 + count) % count : null;
  const nextIdx = hasNav ? (index + 1) % count : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-label={`${parkName} photo viewer`}
      className="m-0 h-full max-h-full w-full max-w-full bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      {/* Neighbor preload — fetched while the user looks at the current image
          so swipe/keyboard nav feels instant. Only renders when open AND >1 photo. */}
      {open && hasNav && prevIdx !== null && nextIdx !== null ? (
        <>
          <link rel="preload" as="image" href={buildPhotoUrl(photos[prevIdx]!.storagePath, 1200)} />
          <link rel="preload" as="image" href={buildPhotoUrl(photos[nextIdx]!.storagePath, 1200)} />
        </>
      ) : null}

      <div
        className="relative flex h-full w-full flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span aria-live="polite" aria-atomic="true">
            {index + 1} of {count}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            className="px-2 py-1 text-2xl leading-none hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white"
          >
            ×
          </button>
        </div>

        <div
          className="relative flex flex-1 items-center justify-center px-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {hasNav ? (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-xl hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
            >
              ‹
            </button>
          ) : null}

          <ResponsiveImage
            key={current.id}
            storagePath={current.storagePath}
            alt={altFallback}
            sizes="100vw"
            loading="eager"
            className="max-h-full max-w-full object-contain"
          />

          {hasNav ? (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-xl hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
            >
              ›
            </button>
          ) : null}
        </div>

        {(current.caption || current.credit) ? (
          <div className="px-4 py-3 text-sm">
            {current.caption ? <p>{current.caption}</p> : null}
            {current.credit ? (
              <p className="mt-1 text-xs italic opacity-80">{current.credit}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
