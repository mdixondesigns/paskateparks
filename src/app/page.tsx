import { HomeParkList } from "@/components/home/HomeParkList";
import { getAllParksForHomepage } from "@/lib/park-query";

// P1-C — Phase 6 homepage is statically generated at build time. The parks
// list is serialized into the HTML; phase 9's Supabase webhook calls
// `/api/revalidate` to rebuild this route when the parks table changes.
// Matches the pattern in /park/[slug]/page.tsx.
export const dynamic = "force-static";

export const metadata = {
  // Phase 6 ships with intentionally minimal copy. The /privacy stub (D11 +
  // CMT-1) carries the real geolocation handling text. Visual + full SEO
  // metadata pass is captured in a later TODO (skipped at user request).
  title: "Pennsylvania Skateparks — find a park near you",
  description:
    "A directory of Pennsylvania skateparks. Find your nearest one by name, by city, or by location.",
};

export default async function Home() {
  const parks = await getAllParksForHomepage();
  return (
    <main id="main" className="mx-auto max-w-2xl">
      <header className="px-4 py-8">
        <h1 className="text-3xl font-bold">Pennsylvania Skateparks</h1>
        <p className="mt-2 text-sm">
          A directory of public skateparks across Pennsylvania. Find a park
          near you, read its rules, and get directions.
        </p>
      </header>
      <HomeParkList parks={parks} />
    </main>
  );
}
