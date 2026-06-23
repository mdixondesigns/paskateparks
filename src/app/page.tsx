import { SyncedMapList } from "@/components/home/SyncedMapList";
import { getAllParksForHomepage } from "@/lib/park-query";

// P1-C — Phase 6 homepage is statically generated at build time. The parks
// list is serialized into the HTML; phase 9's Supabase webhook calls
// `/api/revalidate` to rebuild this route when the parks table changes.
// Matches the pattern in /park/[slug]/page.tsx.
export const dynamic = "force-static";

export const metadata = {
  title: "PA Skateparks — find a park near you",
  description:
    "A directory of Pennsylvania skateparks. Find your nearest one by name, by city, or by location.",
};

export default async function Home() {
  const parks = await getAllParksForHomepage();
  // Hero header (h1 + tagline) removed by user request — the list + map sit
  // directly below the nav bar. Branding lives in SiteHeader; SEO h1 is
  // covered by the per-park profile pages.
  return (
    <main id="main">
      <SyncedMapList parks={parks} />
    </main>
  );
}
