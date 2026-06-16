// Phase 6 D4 + D11 — footer renders on every route via layout.tsx.
//
// Two links in v1: About + Privacy. The /coaching link is deferred until the
// owner's coaching destination is finalized (see TODOS.md). Privacy carries
// the real geolocation-handling copy per CMT-1, since the homepage asks for
// browser location.

export function Footer() {
  return (
    <footer className="mt-12 border-t px-4 py-6 text-sm">
      <nav aria-label="Footer">
        <ul role="list" className="flex flex-wrap gap-4">
          <li>
            <a href="/about" className="underline">
              About
            </a>
          </li>
          <li>
            <a href="/privacy" className="underline">
              Privacy
            </a>
          </li>
        </ul>
      </nav>
      <p className="mt-3">© {new Date().getFullYear()} Pennsylvania Skateparks</p>
    </footer>
  );
}
