"use client";

// URL state for the synced map+list view.
//
// Shape: ?lat=&lng=&zoom=
//   • lat/lng/zoom set the map's initial view on cold load
//
// Two-call contract:
//   const { initialView, writeViewport, setUserDriven } = useMapUrlState();
//
// On cold load: read URL once, expose initialView.
// On every user-driven moveend: caller invokes writeViewport(view).
// The hook debounces 300ms, suppresses writes when isUserDriven=false.
//
// The isUserDriven flag (codex moveend-cascade fix) lives here, not in
// SyncedMapList, so the hook is the single source of truth for "should I
// write the URL right now?" Programmatic setView/flyTo/fitBounds (URL
// restore, list-card focus, find-me grant) set this false; user-initiated
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
  /** Caller invokes on user-driven moveend. Debounced 300ms.
   *  Skipped entirely when isUserDriven=false. */
  writeViewport: (view: MapView) => void;
  /** Programmatic moves (URL restore, fitBounds, flyTo) set false;
   *  user-initiated dragend/zoomend set true. */
  setUserDriven: (driven: boolean) => void;
}

/**
 * Pure parser, exported for unit tests. Returns null when any param is
 * missing, NaN, or out-of-bounds.
 */
export function parseMapUrlState(
  params: URLSearchParams | { get(key: string): string | null },
): { view: MapView | null } {
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const zoom = parseFloat(params.get("zoom") ?? "");

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

  return { view: viewValid ? { lat, lng, zoom } : null };
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
    (view: MapView) => {
      if (!isUserDrivenRef.current) return;

      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        params.set("lat", view.lat.toFixed(4));
        params.set("lng", view.lng.toFixed(4));
        params.set("zoom", String(Math.round(view.zoom)));
        router.replace(`?${params.toString()}`, { scroll: false });
      }, WRITE_DEBOUNCE_MS);
    },
    [router],
  );

  return useMemo(
    () => ({
      initialView: initial.view,
      writeViewport,
      setUserDriven,
    }),
    [initial, writeViewport, setUserDriven],
  );
}
