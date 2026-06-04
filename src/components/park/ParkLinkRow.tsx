import { linkTypeLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  link: ParkWithRelations["links"][number];
}

// Single link row — shared by Connect (section 12) and Support (section 13).
// Per D21: the renderer dispatches by `type`; the display label comes from the
// label map. Optional per-link `label` overrides (e.g. "@fdrskatepark" for IG).
export function ParkLinkRow({ link }: Props) {
  const platformLabel = linkTypeLabel[link.type];
  const displayLabel = link.label ?? platformLabel;

  return (
    <li className="border-t first:border-t-0">
      <a
        href={link.url}
        rel="noopener noreferrer"
        target="_blank"
        className="flex items-baseline justify-between gap-3 px-3 py-3"
      >
        <span className="font-semibold">{platformLabel}</span>
        <span className="text-sm">{displayLabel} ↗</span>
      </a>
    </li>
  );
}
