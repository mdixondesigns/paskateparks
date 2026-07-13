import { LinkIcon } from "@/components/icons/LinkIcon";
import { linkTypeLabel } from "@/lib/labels";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  link: ParkWithRelations["links"][number];
}

// Single link row — shared by Connect (section 12) and Support (section 13).
// Per D21: the renderer dispatches by `type`. Layout is [icon] [name] [↗]:
// the platform icon carries the platform identity so the platform WORD isn't
// spelled out visually; the visible text is the per-link `label` (handle or
// page name, e.g. "@fdrskatepark"), falling back to the platform label only
// when no custom label exists. The <a>'s aria-label always names the platform
// so screen readers announce it (VISUAL-DESIGN.md §17: icon is never the only
// signal).
export function ParkLinkRow({ link }: Props) {
  const platformLabel = linkTypeLabel[link.type];
  const displayLabel = link.label ?? platformLabel;
  // Announce the platform for screen readers; add the handle/name when it adds
  // information beyond the platform word.
  const ariaLabel =
    displayLabel === platformLabel ? platformLabel : `${platformLabel}: ${displayLabel}`;

  return (
    <li className="border-t first:border-t-0">
      <a
        href={link.url}
        rel="noopener noreferrer"
        target="_blank"
        aria-label={ariaLabel}
        className="flex items-center gap-3 px-3 py-3"
      >
        <LinkIcon type={link.type} className="size-5 shrink-0" />
        <span className="font-semibold">{displayLabel}</span>
        <span aria-hidden="true" className="ml-auto text-sm">
          ↗
        </span>
      </a>
    </li>
  );
}
