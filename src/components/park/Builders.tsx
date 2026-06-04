import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  builders: ParkWithRelations["builders"];
}

// Section 11 — builders per D4 / D26. "Built by Spohn Ranch → 5th Pocket →".
// Multi-builder supported. Empty link state = plain text (per D6).
// Hides silently when no builders.
export function Builders({ builders }: Props) {
  if (builders.length === 0) return null;

  return (
    <section aria-labelledby="builders-heading" className="px-4 py-4">
      <h2 id="builders-heading" className="text-xs font-bold uppercase tracking-wider">
        Built by
      </h2>
      <p className="mt-2">
        {builders.map((b, idx) => (
          <span key={b.id}>
            {b.url ? (
              <a href={b.url} rel="noopener noreferrer" target="_blank">
                {b.name}
              </a>
            ) : (
              b.name
            )}
            {idx < builders.length - 1 ? <span aria-hidden="true">, </span> : null}
          </span>
        ))}
      </p>
    </section>
  );
}
