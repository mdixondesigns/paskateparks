import { ParkLinkRow } from "./ParkLinkRow";
import { isSupportLink } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  links: ParkWithRelations["links"];
}

// Section 13 — Support per D23. Renders only the fundraising/donation link types.
// Hides silently when no matching links.
export function SupportSection({ links }: Props) {
  const supportLinks = links.filter((l) => isSupportLink(l.type));
  if (supportLinks.length === 0) return null;

  return (
    <section aria-labelledby="support-heading" className="px-4 py-4">
      <h2 id="support-heading" className="text-xs font-bold uppercase tracking-wider">
        Support this park
      </h2>
      <ul role="list" className="mt-2 border-y">
        {supportLinks.map((l) => (
          <ParkLinkRow key={l.id} link={l} />
        ))}
      </ul>
    </section>
  );
}
