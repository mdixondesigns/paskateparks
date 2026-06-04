import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  // Phase-1 placeholder. Real metadata (title template, OG image, canonical) lands
  // in phase 4 once we have park profiles, and in phase 6 once the homepage copy
  // is finalized per VISUAL-DESIGN.md §16.
  title: "Pennsylvania Skateparks",
  description: "A directory of skateparks across Pennsylvania.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Skip-link per A6 — visible on focus so keyboard users can bypass any future nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-black focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
