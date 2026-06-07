import { ResponsiveImage } from "./ResponsiveImage";

export interface NearbyCardItem {
  name: string;
  city?: string | null;
  state?: string | null;
  /**
   * Distance from the viewer in miles. Optional because phase 6 (D6, D1)
   * renders the same card on the homepage in its no-geo state — where there's
   * no origin to measure from. When undefined, the distance pill is omitted.
   */
  distanceMiles?: number;
  href?: string | null;
  thumbStoragePath?: string | null;
  /**
   * Mark this card as LCP-critical so the thumbnail loads eagerly with
   * fetchpriority="high". Used by the homepage list for the first 3 cards
   * above the fold (D9). Park-profile Nearby sections leave this false.
   */
  priority?: boolean;
}

interface Props {
  item: NearbyCardItem;
}

// Shared card row used by:
//   • park profile Nearby Parks (section 15) + Nearby Shops (section 16) — phase 4
//   • homepage HomeParkList — phase 6 (D6 list-first)
//
// Renders thumbnail (when present) + name + location + optional distance pill.
// Distance rounded to 1 decimal (consistent with WP audit "0.1 miles away" pattern).
export function NearbyCard({ item }: Props) {
  const location = [item.city, item.state].filter(Boolean).join(", ");
  const inner = (
    <>
      {item.thumbStoragePath ? (
        <ResponsiveImage
          storagePath={item.thumbStoragePath}
          alt={`${item.name} thumbnail`}
          sizes="64px"
          width={64}
          height={64}
          className="block h-16 w-16 shrink-0 object-cover"
          loading={item.priority ? "eager" : "lazy"}
          fetchPriority={item.priority ? "high" : undefined}
        />
      ) : (
        <div className="h-16 w-16 shrink-0 bg-gray-100" aria-hidden="true" />
      )}
      <div className="flex-1">
        <p className="font-semibold">{item.name}</p>
        {location ? <p className="text-sm">{location}</p> : null}
      </div>
      {item.distanceMiles !== undefined ? (
        <p
          className="text-sm tabular-nums"
          aria-label={`${item.distanceMiles.toFixed(1)} miles away`}
        >
          {`${item.distanceMiles.toFixed(1)} mi`}
        </p>
      ) : null}
    </>
  );

  return (
    <li className="border-t first:border-t-0">
      {item.href ? (
        <a href={item.href} className="flex items-center gap-3 px-3 py-3">
          {inner}
        </a>
      ) : (
        <div className="flex items-center gap-3 px-3 py-3">{inner}</div>
      )}
    </li>
  );
}
