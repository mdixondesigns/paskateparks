import Link from "next/link";

import { NavLinks } from "./NavLinks";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
          PA Skateparks
        </Link>
        <nav aria-label="Primary">
          <NavLinks />
        </nav>
      </div>
    </header>
  );
}
