// P1 lock: native <img srcset> with three pre-resized JPEG sizes served from
// Supabase Storage. Never use next/image (F2 — no Vercel Image transformations).
// Phase 5's migration script Sharp-resizes every park photo to 3 widths;
// phase 4 renders against the materialized paths.
//
// Format: JPEG (mozJPEG encoding). The earlier F2 spec called for WebP; amended
// in phase 5 to JPEG for shareability — when a user right-clicks "Save image",
// a .jpg opens in every consumer tool (Photos, PowerPoint, old Photoshop, email
// previews), where .webp still chokes in pre-iOS-14 Photos and Windows 7 viewers.
// The performance cost (~70KB extra above-the-fold) is small enough that real
// 4G LCP stays well under the 2.5s budget. See STACK-PIVOT.md F2 amendment.

import { env as publicEnv } from "@/lib/public-env";

const WIDTHS = [400, 800, 1200] as const;
const BUCKET = "photos";

export interface ResponsiveImageProps {
  /** Storage path WITHOUT bucket prefix or size/extension suffix.
   *  e.g. "parks/fdr-test/photo-01" — the component appends @400w.jpg etc. */
  storagePath: string;
  /** REQUIRED. Alt text is never optional — auto-generate via parkName + photoIndex
   *  per D29 if owner hasn't supplied. */
  alt: string;
  /** sizes attribute for the <img>. Defaults to "100vw" — override for layout-constrained images. */
  sizes?: string;
  /** "eager" for above-the-fold (hero); "lazy" for everything else. */
  loading?: "eager" | "lazy";
  /** "high" only for the hero — improves LCP per VISUAL-DESIGN.md §18. */
  fetchPriority?: "high" | "low" | "auto";
  /** Optional width/height — keeps layout stable while images load. */
  width?: number;
  height?: number;
  className?: string;
}

function buildUrl(storagePath: string, width: number): string {
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}@${width}w.jpg`;
}

export function ResponsiveImage({
  storagePath,
  alt,
  sizes = "100vw",
  loading = "lazy",
  fetchPriority,
  width,
  height,
  className,
}: ResponsiveImageProps) {
  const srcset = WIDTHS.map((w) => `${buildUrl(storagePath, w)} ${w}w`).join(", ");
  // Use 800w as the <img src> fallback — most "average" size; the browser's
  // srcset selection will override on render based on viewport.
  const fallback = buildUrl(storagePath, 800);
  return (
    <img
      src={fallback}
      srcSet={srcset}
      sizes={sizes}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      width={width}
      height={height}
      className={className}
    />
  );
}
