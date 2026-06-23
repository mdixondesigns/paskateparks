"use client";

import { usePathname } from "next/navigation";

// Site-wide footer rendered on every route EXCEPT the homepage. The home
// page has its own compact footer baked into the bottom of the synced list
// pane (HomeFooter) so the layout reads list-then-footer rather than
// list-then-map-then-footer. Hiding here keeps the rest of the site (about,
// privacy, county, obstacle, park standalone) on the canonical layout.
export function Footer() {
  const pathname = usePathname();
  if (pathname === "/") return null;
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
