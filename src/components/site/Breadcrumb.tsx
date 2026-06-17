import Link from "next/link";

import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, type BreadcrumbEntry } from "@/lib/json-ld";

interface Props {
  // Full canonical hierarchy. Last entry is the current page. JSON-LD always
  // emits every entry — that's the machine-readable hierarchy for search
  // engines. Visible UI may drop the last entry via `hideCurrent` when the
  // page header already names the current location (e.g. /park/<slug>'s H1).
  trail: readonly BreadcrumbEntry[];
  hideCurrent?: boolean;
}

export function Breadcrumb({ trail, hideCurrent = false }: Props) {
  if (trail.length === 0) return null;

  const visible = hideCurrent ? trail.slice(0, -1) : trail;
  const lastIndex = visible.length - 1;

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <nav aria-label="Breadcrumb" className="text-sm">
        {visible.map((entry, i) => {
          const isLast = i === lastIndex;
          const isCurrentPage = !hideCurrent && isLast;
          return (
            <span key={entry.url}>
              {isCurrentPage ? (
                <span aria-current="page">{entry.name}</span>
              ) : (
                <Link href={entry.url} className="underline">
                  {entry.name}
                </Link>
              )}
              {!isLast && <span aria-hidden="true"> / </span>}
            </span>
          );
        })}
      </nav>
    </>
  );
}
