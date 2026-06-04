import { ResponsiveImage } from "./ResponsiveImage";

export interface NearbyCardItem {
  name: string;
  city?: string | null;
  state?: string | null;
  distanceMiles: number;
  href?: string | null;
  thumbStoragePath?: string | null;
}

interface Props {
  item: NearbyCardItem;
}

// Shared card row used by Nearby Parks (section 15) and Nearby Shops (section 16).
// Renders thumbnail (when present) + name + location + distance.
// Distance rounded to 1 decimal (consistent with WP audit "0.1 miles away" pattern).
export function NearbyCard({ item }: Props) {
  const distance = `${item.distanceMiles.toFixed(1)} mi`;
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
        />
      ) : (
        <div className="h-16 w-16 shrink-0 bg-gray-100" aria-hidden="true" />
      )}
      <div className="flex-1">
        <p className="font-semibold">{item.name}</p>
        {location ? <p className="text-sm">{location}</p> : null}
      </div>
      <p className="text-sm tabular-nums" aria-label={`${item.distanceMiles.toFixed(1)} miles away`}>
        {distance}
      </p>
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
