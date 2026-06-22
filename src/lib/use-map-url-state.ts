"use client";

// T3 — URL state for the synced map+list view.
//
// Shape: ?lat=&lng=&zoom=&filtered=1
//   • lat/lng/zoom set the map's initial view on cold load
//   • filtered=1 means "the sender had bbox-filtered the list" — auto-apply
//     the bbox filter to the list on load (D12 — shareable URLs preserve the
//     SENDER's list state, not just map view)
//
// Two-call contract:
//   const { initialView, filteredFromUrl, writeViewport, setUserDriven }
//     = useMapUrlState();
//
// On cold load: read URL once, expose initialView + filteredFromUrl.
// On every user-driven moveend: caller invokes writeViewport(view, filtered).
// The hook debounces 300ms, suppresses writes when isUserDriven=false.
//
// The isUserDriven flag (codex moveend-cascade fix) lives here, not in
// SyncedMapList, so the hook is the single source of truth for "should I
// write the URL right now?" Programmatic setView/flyTo/fitBounds (URL
// restore, "See all" reset, list-card click) set this false; user-initiated
// dragend/zoomend set it true.

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WRITE_DEBOUNCE_MS = 300;

// PA bounding box — used to reject obviously-bogus URL params. Loose by
// design (Lake Erie shoreline is ~42.5N, southern border ~39.7N, far west
// ~80.5W, far east ~74.7W) plus a small margin so users can pan slightly
// off the state and the URL still validates.
const PA_LAT_MIN = 39.0;
const PA_LAT_MAX = 43.0;
const PA_LNG_MIN = -81.0;
const PA_LNG_MAX = -74.0;
const ZOOM_MIN = 5;
const ZOOM_MAX = 18;

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface UseMapUrlStateResult {
  /** Initial view from URL params, or null if absent/invalid. Stable
   *  across renders — captured once on mount. */
  initialView: MapView | null;
  /** `filtered=1` was present on cold load AND initialView was valid. */
  filteredFromUrl: boolean;
  /** Caller invokes on user-driven moveend. Debounced 300ms.
   *  Skipped entirely when isUserDriven=false. */
  writeViewport: (view: MapView, filtered: boolean) => void;
  /** Programmatic moves (URL restore, fitBounds, flyTo) set false;
   *  user-initiated dragend/zoomend set true. */
  setUserDriven: (driven: boolean) => void;
}

/**
 * Pure parser, exported for unit tests. Returns null when any param is
 * missing, NaN, or out-of-bounds. `filtered` is only honored when the
 * view is also valid (URL with `filtered=1` but no lat/lng is treated
 * as inconsistent — silently drop the filter flag).
 */
export function parseMapUrlState(
  params: URLSearchParams | { get(key: string): string | null },
): { view: MapView | null; filtered: boolean } {
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const zoom = parseFloat(params.get("zoom") ?? "");
  const filteredRaw = params.get("filtered");

  const viewValid =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(zoom) &&
    lat >= PA_LAT_MIN &&
    lat <= PA_LAT_MAX &&
    lng >= PA_LNG_MIN &&
    lng <= PA_LNG_MAX &&
    zoom >= ZOOM_MIN &&
    zoom <= ZOOM_MAX;

  return {
    view: viewValid ? { lat, lng, zoom } : null,
    filtered: viewValid && filteredRaw === "1",
  };
}

export function useMapUrlState(): UseMapUrlStateResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial view captured once on mount. URL changes after mount come
  // through writeViewport's router.replace; we don't react to external
  // searchParams mutations (only the hook itself writes them).
  const [initial] = useState(() => parseMapUrlState(searchParams));

  const isUserDrivenRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup any pending debounced write on unmount so a late timer doesn't
  // navigate after the user has left the route.
  useEffect(() => {
    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, []);

  const setUserDriven = useCallback((driven: boolean) => {
    isUserDrivenRef.current = driven;
  }, []);

  const writeViewport = useCallback(
    (view: MapView, filtered: boolean) => {
      if (!isUserDrivenRef.current) return;

      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        params.set("lat", view.lat.toFixed(4));
        params.set("lng", view.lng.toFixed(4));
        params.set("zoom", String(Math.round(view.zoom)));
        if (filtered) params.set("filtered", "1");
        router.replace(`?${params.toString()}`, { scroll: false });
      }, WRITE_DEBOUNCE_MS);
    },
    [router],
  );

  return useMemo(
    () => ({
      initialView: initial.view,
      filteredFromUrl: initial.filtered,
      writeViewport,
      setUserDriven,
    }),
    [initial, writeViewport, setUserDriven],
  );
}
