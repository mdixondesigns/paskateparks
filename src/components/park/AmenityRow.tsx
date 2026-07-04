import { MaterialIcon } from "@/components/icons/MaterialIcon";
import { ResponsiveImage } from "./ResponsiveImage";
import { amenityLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  amenity: ParkWithRelations["amenities"][number];
}

// Shared row-header grid — chevron | label | status icon — used whether or
// not a row is expandable, so the status icon always lines up down the list.
const HEADER_GRID = "grid grid-cols-[20px_1fr_28px] items-center gap-2";

// Success/danger colors per VISUAL-DESIGN.md §3 (--lime / --red tokens) —
// hardcoded hex since the CSS custom-property system described there isn't
// wired up yet. Shape (check vs. slashed circle), not just color, carries
// the status per §17 "color is never the only signal".
function StatusIcon({ present, label }: { present: boolean; label: string }) {
  // role="img" is load-bearing: a bare <span> has an implicit ARIA role of
  // "generic", which prohibits accessible-name attributes like aria-label
  // (axe-core: "aria-prohibited-attr"). role="img" explicitly allows naming.
  return present ? (
    <span role="img" aria-label={`${label}: Available`}>
      <MaterialIcon name="check" className="size-5 text-[#92C44F]" />
    </span>
  ) : (
    <span role="img" aria-label={`${label}: Not available`}>
      <MaterialIcon name="block" className="size-5 text-[#D9402B]" />
    </span>
  );
}

// D18 amenity row — present (Y/N) + Notes + Photo. All three optional independently:
// e.g. "no onsite shop, but there's a great one nearby — here's a photo" is a valid
// row state per TEST-PLAN.md edge cases.
//
// Rows with notes and/or a photo render as a native <details> accordion —
// collapsed by default, showing just the label + status icon. Rows with
// neither render as a plain static line with no disclosure affordance, since
// there's nothing to disclose. <details>/<summary> needs no JS, so this stays
// a server component.
export function AmenityRow({ amenity }: Props) {
  const label = amenityLabel[amenity.type];
  const hasNotes = Boolean(amenity.notes?.trim());
  const hasPhoto = Boolean(amenity.photoPath?.trim());

  if (!hasNotes && !hasPhoto) {
    return (
      <li className="border-t py-3 first:border-t-0">
        <div className={HEADER_GRID}>
          <span aria-hidden="true" />
          <span className="font-semibold">{label}</span>
          <StatusIcon present={amenity.present} label={label} />
        </div>
      </li>
    );
  }

  return (
    <li className="border-t py-3 first:border-t-0">
      <details className="group">
        <summary
          className={`${HEADER_GRID} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          <MaterialIcon
            name="chevron_right"
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
          />
          <span className="font-semibold">{label}</span>
          <StatusIcon present={amenity.present} label={label} />
        </summary>
        {/* Photo + notes render side by side when both are present; either
            one alone spans the full row. */}
        <div className="mt-2 flex gap-3 pl-[28px]">
          {hasPhoto ? (
            <ResponsiveImage
              storagePath={amenity.photoPath!}
              alt={`${label} at this park`}
              sizes="120px"
              width={120}
              height={90}
              className="block h-[90px] w-[120px] shrink-0 object-cover"
            />
          ) : null}
          {hasNotes ? <p className="text-sm italic">{amenity.notes}</p> : null}
        </div>
      </details>
    </li>
  );
}
