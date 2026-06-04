// P1 lock: native <picture><source srcset> with three pre-resized WebP sizes
// served from Supabase Storage. Never use next/image (F2 — no Vercel Image
// transformations). Phase 5's migration script uploads the three .webp files
// for every park photo; phase 4 renders against them.

import { env as publicEnv } from "@/lib/public-env";

const WIDTHS = [400, 800, 1200] as const;
const BUCKET = "photos";

export interface ResponsiveImageProps {
  /** Storage path WITHOUT bucket prefix or size/extension suffix.
   *  e.g. "parks/fdr-test/photo-01" — the component appends @400w.webp etc. */
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
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}@${width}w.webp`;
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
  // Use the 800w as the <img src> fallback — most "average" size, will be
  // overridden by the browser's srcset selection.
  const fallback = buildUrl(storagePath, 800);
  return (
    <picture>
      <source type="image/webp" srcSet={srcset} sizes={sizes} />
      <img
        src={fallback}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        width={width}
        height={height}
        className={className}
      />
    </picture>
  );
}
