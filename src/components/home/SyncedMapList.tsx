"use client";

// Phase 10 — synced map+list client island for /.
//
// Replaces the list-only homepage with a Zillow-style two-pane view:
// list left, map right (desktop). The list HTML is SSR'd by app/page.tsx
// (preserves D6 SEO bet); this client island hydrates the synced behavior
// over it.
//
//   ┌─ Synced wrapper state (lifted from HomeParkList + MapView) ──────┐
//   │  selectedParkId   ← bidirectional click sync                     │
//   │  bboxFilter       ← "Search this area" applies/clears            │
//   │  isUserDriven     ← suppress URL writes during programmatic moves│
//   └──────────────────────────────────────────────────────────────────┘
//
// Currently scaffolded (T2): layout + lifted state stubs + derived
// mapParks. Behavior wiring lands in T3 (URL state), T4 (bbox filter),
// T5 (MapView props), T6 (click sync), T7 (search this area), T8 (mobile
// lazy-mount).

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { hasCoords } from "@/lib/has-coords";
import type { HomeParkRow, MapParkRow } from "@/lib/park-query";

import { HomeParkList } from "./HomeParkList";

// D11 — dynamic-import MapView so Leaflet stays off the / critical path.
// Same pattern as MapViewLoader.tsx (which serves /map today; will be
// retired once T9 lands the /map → / redirect).
const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => null,
});

interface Props {
  parks: HomeParkRow[];
}

export function SyncedMapList({ parks }: Props) {
  // T3 + T6 will populate these; scaffolded here so the lifted-state
  // shape is visible from day one.
  const [selectedParkId, _setSelectedParkId] = useState<number | null>(null);
  void selectedParkId; // T5/T6 consume this; ts-noop until then

  // E1 — derive map-eligible parks client-side from the single
  // getAllParksForHomepage query. The wrapper does NOT re-query the DB.
  const mapParks: MapParkRow[] = useMemo(
    () =>
      parks
        .filter(hasCoords)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          city: p.city,
          state: p.state,
          lat: p.lat,
          lng: p.lng,
          heroPhotoPath: p.heroPhotoPath,
        })),
    [parks],
  );

  return (
    <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-0">
      <div className="lg:max-h-[100dvh] lg:overflow-y-auto">
        <HomeParkList parks={parks} />
      </div>
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-[100dvh]">
        <MapView parks={mapParks} />
      </div>
    </div>
  );
}
