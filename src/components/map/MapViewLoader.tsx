"use client";

// Phase 7 — thin client-component shim around next/dynamic(MapView, ssr:false).
//
// Why this file exists: Next 16 forbids `next/dynamic` with `ssr: false` in
// Server Components — the dynamic+no-SSR pair must live in a Client Component.
// /map/page.tsx is an RSC that fetches parks at build time, so it can't host
// the dynamic import directly. This shim is the smallest possible bridge:
// take the already-fetched parks as a prop, dynamic-import MapView client-side.
//
// Phase 7 ship-review F4: loading prop returns null intentionally. The RSC
// renders the visible-by-default fallback park list above MapViewLoader; that
// list IS the loading affordance during the dynamic-import window. A separate
// h-screen "Loading map…" skeleton stacked below the list would push total
// page height to ~2x viewport on slow 4G — exactly the P0 use case where the
// fallback list already gives the parent something usable.

import dynamic from "next/dynamic";

import type { MapPark } from "./MapView";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => null,
});

interface Props {
  parks: MapPark[];
}

export function MapViewLoader({ parks }: Props) {
  return <MapView parks={parks} />;
}
