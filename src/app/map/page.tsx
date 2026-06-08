import { MapViewLoader } from "@/components/map/MapViewLoader";
import { getOpenParksForMap } from "@/lib/park-query";

// Phase 7 — /map/ RSC. Locked plan decisions:
//   1D — map-only layout; / owns list browsing
//   1E + CMT-3 — visible-by-default park list in the RSC; MapView's mount
//                signal flips it to sr-only via globals.css. If the map
//                never mounts, the list stays visible for sighted users.
//   CMT-4 — inline <link rel="preconnect"> for tile.openstreetmap.org via
//           React 19 head-hoisting (cleaner than Next metadata.other, which
//           only emits <meta>, not <link>)
//   P1-C — force-static; phase-9 webhook revalidates when parks change
//
// MapViewLoader is a thin client-component shim that handles the
// next/dynamic(MapView, ssr:false) call. Next 16 forbids ssr:false in
// Server Components, so the dynamic import must live inside a "use client"
// module — MapViewLoader.tsx is that bridge.
export const dynamic = "force-static";

export const metadata = {
  title: "Map — Pennsylvania Skateparks",
  description:
    "Interactive map of every open public skatepark in Pennsylvania. Tap any pin to view the park's profile, hours, and directions.",
};

export default async function MapPage() {
  const parks = await getOpenParksForMap();

  return (
    <main id="main" className="min-h-screen">
      {/* CMT-4 — React 19 hoists <link> elements into <head> automatically.
          Inline JSX is the cleanest way to emit per-route preconnect in App
          Router. The P0 audience (modern mobile Chrome / Safari) all support
          preconnect, so the dns-prefetch fallback would be redundant. */}
      <link rel="preconnect" href="https://tile.openstreetmap.org" />

      <header className="sr-only">
        {/* H1 is screen-reader-only; the map dominates the viewport visually. */}
        <h1>Pennsylvania Skateparks Map</h1>
      </header>

      {/* CMT-3 visible-by-default fallback. globals.css hides this with sr-only
          styles once <body data-map-mounted="true">. If MapView never mounts
          (slow 4G, JS error, blocked Leaflet bundle), the list stays visible
          and the parent always has a usable representation. */}
      <ul
        className="map-fallback-list border-y"
        aria-label="All Pennsylvania skateparks (list view)"
      >
        {parks.map((park) => (
          <li key={park.slug} className="border-t first:border-t-0">
            <a href={`/park/${park.slug}`} className="block px-4 py-3 text-sm">
              <span className="font-semibold">{park.name}</span>
              <span className="ml-2">
                {park.city}, {park.state}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <MapViewLoader parks={parks} />
    </main>
  );
}
