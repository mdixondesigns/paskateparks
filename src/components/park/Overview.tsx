import { PhotoStrip } from "./PhotoStrip";
import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  park: ParkWithRelations;
}

// Section 5 — overview per D14. Description paragraph + horizontally scrollable
// photo strip. Both individually optional; hides silently when neither is present.
//
// park.description carries raw HTML straight from the WP migration — typical
// shape is `<p>...</p>\n\n<p>...</p>`. Rendering it as a JSX child would
// string-escape the angle brackets — the literal-<p>-tags bug fixed 2026-06-15.
// dangerouslySetInnerHTML is safe in this context:
//   • Source is owner-authored via Supabase Studio (auth gated)
//   • RLS is deny-all-anon on parks (0001_rls.sql + 0005_enable_rls_tracking)
//   • No user-submitted content path writes to parks.description
// If a future feature opens up anon writes to this field, switch to a
// sanitizer (DOMPurify or rehype-sanitize) before re-enabling.
//
// `space-y-3` provides vertical rhythm between the rendered <p> elements via
// Tailwind's adjacent-sibling selector — works on innerHTML children, not just
// React children. No @tailwindcss/typography dependency needed.
export function Overview({ park }: Props) {
  const hasDescription = park.description && park.description.trim().length > 0;
  const hasPhotos = park.photos.length > 0;
  if (!hasDescription && !hasPhotos) return null;

  return (
    <section aria-labelledby="overview-heading" className="px-4 py-4">
      <h2 id="overview-heading" className="text-xs font-bold uppercase tracking-wider">
        Overview
      </h2>
      {hasDescription ? (
        <div
          className="mt-2 space-y-3 text-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: park.description! }}
        />
      ) : null}
      {hasPhotos ? (
        <div className="mt-3">
          <PhotoStrip parkName={park.name} photos={park.photos} />
        </div>
      ) : null}
    </section>
  );
}
