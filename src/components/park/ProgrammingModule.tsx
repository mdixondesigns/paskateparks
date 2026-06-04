interface Props {
  parkCity: string;
}

// Section 9 — Programming module per D27 / VISUAL-DESIGN.md §12.
// Renders ONLY when park.programming === true. Template-level CTAs (not per-park).
// Visual treatment (dark band + paint splashes + pull-quote) is deferred to the
// VISUAL-DESIGN.md application pass; structure is here so it can attach.
//
// CTAs link to /find-a-coach and /become-a-coach which we haven't built yet —
// they'll 404 in phase 4, that's expected. Real routes land later.
export function ProgrammingModule({ parkCity }: Props) {
  return (
    <section
      aria-labelledby="programming-heading"
      className="bg-black px-4 py-6 text-white"
      data-section="programming"
    >
      <p className="text-xs font-bold uppercase tracking-wider">
        For parents · the coaching team
      </p>
      <h2 id="programming-heading" className="mt-2 text-xl font-bold">
        New to skateparks? You&apos;re not alone — most parents aren&apos;t either.
      </h2>
      <p className="mt-3 max-w-prose text-sm">
        We help families get comfortable at the park, learn the basics, and find
        skating they actually enjoy.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href="/find-a-coach"
          className="rounded border border-white px-4 py-2 text-center"
        >
          Find a coach in {parkCity} →
        </a>
        <a
          href="/become-a-coach"
          className="rounded border border-white px-4 py-2 text-center"
        >
          Become a coach
        </a>
      </div>
    </section>
  );
}
