import { obstacleLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  obstacles: ParkWithRelations["obstacles"];
}

// Section 10 — obstacles per D25. Chip/tag list, 38 possible values from the
// WP taxonomy. Hides silently when empty.
export function Obstacles({ obstacles }: Props) {
  if (obstacles.length === 0) return null;

  // Sort alphabetically by display label so the visual order is consistent
  // across parks regardless of insert order.
  const sorted = [...obstacles].sort((a, b) =>
    obstacleLabel[a].localeCompare(obstacleLabel[b]),
  );

  return (
    <section aria-labelledby="obstacles-heading" className="px-4 py-4">
      <h2 id="obstacles-heading" className="text-xs font-bold uppercase tracking-wider">
        Obstacles
      </h2>
      <ul role="list" className="mt-2 flex flex-wrap gap-2">
        {sorted.map((o) => (
          <li key={o} className="rounded-full border px-3 py-1 text-sm">
            {obstacleLabel[o]}
          </li>
        ))}
      </ul>
    </section>
  );
}
