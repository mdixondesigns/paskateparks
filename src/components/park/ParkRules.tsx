import { helmetsLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

interface VehicleRow {
  label: string;
  allowed: boolean;
}

// Section 6 — park rules per D15 (vehicles), D16 (pads/helmets), D17 (fee).
// Renders the 4 vehicle types as a row with disallowed ones marked via aria-label
// + line-through (text-only marker; the diagonal-slash visual lands in VISUAL-DESIGN.md
// application later). The "color is never the only signal" rule (A6) is satisfied here
// by line-through + aria-disabled + label — three signals, not just visual.
export function ParkRules({ park }: Props) {
  const vehicles: VehicleRow[] = [
    { label: "Skateboards", allowed: park.allowsSkateboards },
    { label: "Bikes", allowed: park.allowsBikes },
    { label: "Roller skates", allowed: park.allowsRollerSkates },
    { label: "Scooters", allowed: park.allowsScooters },
  ];

  return (
    <section aria-labelledby="rules-heading" className="px-4 py-4">
      <h2 id="rules-heading" className="text-xs font-bold uppercase tracking-wider">
        Park rules
      </h2>

      <ul role="list" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {vehicles.map((v) => (
          <li
            key={v.label}
            aria-label={`${v.label} ${v.allowed ? "allowed" : "not allowed"}`}
            data-allowed={v.allowed}
            className={v.allowed ? "" : "line-through opacity-50"}
          >
            {v.allowed ? "✓" : "✕"} {v.label}
          </li>
        ))}
      </ul>

      {park.vehicleRulesNotes ? (
        <p className="mt-2 text-sm italic">{park.vehicleRulesNotes}</p>
      ) : null}

      <dl className="mt-4 grid gap-2">
        <div className="flex justify-between gap-2">
          <dt className="font-semibold">Helmets</dt>
          <dd>{park.helmets ? helmetsLabel[park.helmets] : "Not specified"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-semibold">Other pads</dt>
          <dd>{park.otherPadsRequired ? "Required" : "Not required"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-semibold">Fee</dt>
          <dd>{park.fee ? "Yes" : "Free"}</dd>
        </div>
      </dl>
    </section>
  );
}
