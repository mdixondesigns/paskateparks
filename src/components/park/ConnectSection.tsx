import { ParkLinkRow } from "./ParkLinkRow";
import { isConnectLink } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  links: ParkWithRelations["links"];
}

// Section 12 — Connect per D21. Renders only the website/social link types.
// Hides silently when no matching links.
export function ConnectSection({ links }: Props) {
  const connectLinks = links.filter((l) => isConnectLink(l.type));
  if (connectLinks.length === 0) return null;

  return (
    <section aria-labelledby="connect-heading" className="px-4 py-4">
      <h2 id="connect-heading" className="text-xs font-bold uppercase tracking-wider">
        Connect
      </h2>
      <ul role="list" className="mt-2 border-y">
        {connectLinks.map((l) => (
          <ParkLinkRow key={l.id} link={l} />
        ))}
      </ul>
    </section>
  );
}
