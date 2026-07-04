import "./globals.css";

import type { Metadata } from "next";

import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  // Per-route titles override via `metadata` exports (homepage in src/app/page.tsx,
  // park profile in src/app/park/[slug]/page.tsx). Full SEO metadata pass
  // (OG image, JSON-LD ItemList, canonical) deferred to a later TODO.
  title: "PA Skateparks",
  description: "A directory of skateparks across Pennsylvania.",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Next.js parallel-routes @modal slot. Renders src/app/@modal/default.tsx
  // (null) on every page except when an intercepting route at
  // src/app/@modal/(.)park/[slug] matches a client-side navigation from /.
  // See docs/designs/park-modal.md for the full pattern.
  modal: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-dvh flex-col">
        {/* Skip-link per A6 — visible on focus so keyboard users can bypass any future nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-black focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <SiteHeader />
        {children}
        {modal}
        <Footer />
      </body>
    </html>
  );
}
