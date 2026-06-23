"use client";

// Phase 10 — synced map+list client island for /.
//
// Two-pane synced view: list left, map right (desktop). List HTML is SSR'd
// by app/page.tsx (preserves D6 SEO bet); this client island hydrates the
// synced behavior over it.
//
//   ┌─ State (lifted from HomeParkList + MapView) ────────────────────────┐
//   │  userLocation     ← single source for both panes (blue dot + sort)  │
//   │  mapCenter        ← list sorts by distance from map center on pan   │
//   │  popupOpenForId   ← persistent .card-selected while popup is open   │
//   │  hoveredParkId    ← list hover/focus → openPopup on the map         │
//   └─────────────────────────────────────────────────────────────────────┘
//
// Click-sync direction asymmetry: list cards are <a href="/park/<slug>"> so
// clicking a card navigates away. List → map sync is instead via hover/focus
// (opens popup without leaving the page). Marker → card sync via popupopen
// (scrolls card into view + .card-selected highlight that persists until the
// popup is dismissed).

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hasCoords } from "@/lib/has-coords";
import type { HomeParkRow, MapParkRow } from "@/lib/park-query";
import { useMapUrlState } from "@/lib/use-map-url-state";

import { HomeParkList } from "./HomeParkList";

import type { MapMoveEnd } from "@/components/map/MapView";

// Mobile breakpoint mirrors Tailwind's `lg:` (1024px). Desktop renders the
// two-pane synced layout; below it we render list-only with a Map pill
// that opens a full-screen overlay (lazy-mount).
const DESKTOP_MIN_PX = 1024;

// Programmatic-move window: initial fit + find-me flyTo fire moveends that
// should NOT write the URL or update the user-driven mapCenter for sort.
// Timer-based because Leaflet's flyTo animation fires multiple moveends as
// it eases toward the target.
const PROGRAMMATIC_MOVE_WINDOW_MS = 800;

const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => null,
});

interface Props {
  parks: HomeParkRow[];
}

export function SyncedMapList({ parks }: Props) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  // popupOpenForId: which park's marker has its popup currently displayed.
  // Set by Leaflet's popupopen event, cleared by popupclose. Drives the
  // persistent .card-selected highlight + scrollIntoView on the list card.
  const [popupOpenForId, setPopupOpenForId] = useState<number | null>(null);
  // hoveredParkId: list-card hover/focus target. Driven by delegated
  // pointerover/focusin on the list container, gated to hover-capable
  // pointers (touch devices skip it). Hover-out does NOT clear — the popup
  // stays open until the user dismisses it (matches the click-pinned UX).
  const [hoveredParkId, setHoveredParkId] = useState<number | null>(null);

  const listContainerRef = useRef<HTMLDivElement>(null);
  const popupOpenForIdRef = useRef<number | null>(null);
  const hoveredParkIdRef = useRef<number | null>(null);
  const flashedElRef = useRef<HTMLElement | null>(null);
  // Explicit signal: "the next popupopen was caused by a marker click on
  // the map, so scroll the matching list card into view." Set in the
  // onMarkerClick callback; cleared after the scroll fires. Hover/focus
  // paths never touch this ref → hover-driven opens never scroll.
  const scrollTargetRef = useRef<number | null>(null);

  // Keep refs in sync so popupopen/popupclose closures see fresh values
  // without re-binding listeners on every state change.
  useEffect(() => {
    popupOpenForIdRef.current = popupOpenForId;
  }, [popupOpenForId]);
  useEffect(() => {
    hoveredParkIdRef.current = hoveredParkId;
  }, [hoveredParkId]);

  const { initialView, writeViewport, setUserDriven } = useMapUrlState();

  const expectingProgrammaticMoveRef = useRef<boolean>(true);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [mobileMapEverOpened, setMobileMapEverOpened] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  // (hover: hover) gates the list-card hover sync — touch devices should
  // not fire popup-open on every tap (the tap is for navigation). Default
  // true for SSR; the effect corrects after hydration on touch hardware.
  const [hoverCapable, setHoverCapable] = useState(true);

  useEffect(() => {
    const desktopMql = window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`);
    setIsDesktop(desktopMql.matches);
    const onDesktopChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    desktopMql.addEventListener("change", onDesktopChange);

    const hoverMql = window.matchMedia("(hover: hover)");
    setHoverCapable(hoverMql.matches);
    const onHoverChange = (e: MediaQueryListEvent) => setHoverCapable(e.matches);
    hoverMql.addEventListener("change", onHoverChange);

    return () => {
      desktopMql.removeEventListener("change", onDesktopChange);
      hoverMql.removeEventListener("change", onHoverChange);
    };
  }, []);

  // E1 — derive map-eligible parks client-side from the single
  // getAllParksForHomepage query.
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

  // popupOpenForId effect — toggle .card-selected on the matching list
  // card. Scroll the card into view ONLY when scrollTargetRef matches the
  // open id (set by onMarkerClick). Hover/focus paths leave the ref null
  // → hover-driven opens never scroll.
  useEffect(() => {
    if (flashedElRef.current) {
      flashedElRef.current.classList.remove("card-selected");
      flashedElRef.current = null;
    }
    if (popupOpenForId == null) return;
    const root = listContainerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-park-id="${popupOpenForId}"]`);
    if (!el) return;
    el.classList.add("card-selected");
    flashedElRef.current = el;
    if (scrollTargetRef.current === popupOpenForId) {
      scrollTargetRef.current = null;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [popupOpenForId]);

  // Cleanup on unmount — any active highlight must not leak DOM state if
  // the wrapper is torn down (e.g., route change in dev).
  useEffect(() => {
    return () => {
      if (flashedElRef.current) {
        flashedElRef.current.classList.remove("card-selected");
        flashedElRef.current = null;
      }
    };
  }, []);

  // Delegated hover/focus listeners. Attached once after mount; resolve the
  // park id via `closest('[data-park-id]')` so we don't re-bind when the
  // list re-renders (sort changes, filter, etc.). Gated by hoverCapable —
  // touch devices skip pointerover so tap-to-navigate isn't intercepted.
  useEffect(() => {
    const root = listContainerRef.current;
    if (!root) return;

    function idFromEvent(e: Event): number | null {
      const target = e.target;
      if (!(target instanceof Element)) return null;
      const card = target.closest<HTMLElement>("[data-park-id]");
      if (!card) return null;
      const raw = card.dataset.parkId;
      const id = raw ? Number.parseInt(raw, 10) : NaN;
      return Number.isFinite(id) ? id : null;
    }

    const handlePointerOver = (e: Event) => {
      if (!hoverCapable) return;
      const id = idFromEvent(e);
      if (id != null) setHoveredParkId(id);
    };
    const handleFocusIn = (e: Event) => {
      const id = idFromEvent(e);
      if (id != null) setHoveredParkId(id);
    };

    root.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("focusin", handleFocusIn);
    return () => {
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("focusin", handleFocusIn);
    };
  }, [hoverCapable]);

  const beginProgrammaticMoveWindow = useCallback(() => {
    expectingProgrammaticMoveRef.current = true;
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current = setTimeout(() => {
      expectingProgrammaticMoveRef.current = false;
      programmaticTimerRef.current = null;
    }, PROGRAMMATIC_MOVE_WINDOW_MS);
  }, []);

  // Initial mount: open the programmatic-move window so MapView's initial
  // fitBounds/setView moveend lands inside it.
  useEffect(() => {
    beginProgrammaticMoveWindow();
    return () => {
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    };
  }, [beginProgrammaticMoveWindow]);

  const handleMoveEnd = useCallback(
    (event: MapMoveEnd) => {
      const isProgrammatic = expectingProgrammaticMoveRef.current;
      if (isProgrammatic) {
        // Programmatic moves still update mapCenter so the list reflects
        // where the map landed after find-me flyTo or initial fitBounds —
        // but the URL is left alone (URL is for user-driven shareable state).
        setMapCenter({ lat: event.lat, lng: event.lng });
        return;
      }
      setMapCenter({ lat: event.lat, lng: event.lng });
      setUserDriven(true);
      writeViewport({ lat: event.lat, lng: event.lng, zoom: event.zoom });
    },
    [setUserDriven, writeViewport],
  );

  const handleLocation = useCallback(
    (lat: number, lng: number) => {
      // Fly-to is programmatic — suppress the URL write that the moveend
      // would otherwise trigger.
      beginProgrammaticMoveWindow();
      setUserLocation({ lat, lng });
    },
    [beginProgrammaticMoveWindow],
  );

  const handleMarkerClick = useCallback((id: number) => {
    // Arm the scroll-into-view for the popup that's about to open. Leaflet's
    // bindPopup auto-opens on click, so popupopen fires right after this in
    // the same JS tick — the popupOpenForId effect picks up the armed ref
    // and scrolls. Hover/focus paths don't set this ref, so they don't scroll.
    scrollTargetRef.current = id;
  }, []);

  const handlePopupOpen = useCallback((id: number) => {
    setPopupOpenForId(id);
  }, []);

  const handlePopupClose = useCallback((id: number) => {
    // Only clear if this is the popup we're tracking — Leaflet may fire
    // popupclose for a stale popup (autoClose during a switch) that we've
    // already moved past.
    if (popupOpenForIdRef.current === id) setPopupOpenForId(null);
    // Also clear hoveredParkId so re-hovering the same card re-fires the
    // open-popup effect (null → id transition is needed for re-trigger).
    if (hoveredParkIdRef.current === id) setHoveredParkId(null);
  }, []);

  const shouldMountMap = isDesktop || mobileMapEverOpened;

  const handleOpenMobileMap = useCallback(() => {
    beginProgrammaticMoveWindow();
    setMobileMapEverOpened(true);
    setMobileMapOpen(true);
  }, [beginProgrammaticMoveWindow]);
  const handleCloseMobileMap = useCallback(() => {
    setMobileMapOpen(false);
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-0">
      <div
        ref={listContainerRef}
        className={`lg:max-h-[100dvh] lg:overflow-y-auto ${mobileMapOpen ? "hidden lg:block" : ""}`}
      >
        <HomeParkList
          parks={parks}
          userLocation={userLocation}
          mapCenter={mapCenter}
          onLocation={handleLocation}
        />
      </div>
      <div
        className={
          mobileMapOpen
            ? "fixed inset-0 z-[2000] lg:relative lg:inset-auto lg:z-auto lg:sticky lg:top-0 lg:h-[100dvh]"
            : "relative hidden lg:block lg:sticky lg:top-0 lg:h-[100dvh]"
        }
      >
        {shouldMountMap ? (
          <MapView
            parks={mapParks}
            initialView={initialView}
            userLocation={userLocation}
            hoveredParkId={hoveredParkId}
            onMoveEnd={handleMoveEnd}
            onMarkerClick={handleMarkerClick}
            onPopupOpen={handlePopupOpen}
            onPopupClose={handlePopupClose}
          />
        ) : null}
        {mobileMapOpen ? (
          <button
            type="button"
            onClick={handleCloseMobileMap}
            aria-label="Close map"
            className="absolute right-3 top-3 z-[2001] flex h-10 w-10 items-center justify-center rounded-full border bg-white text-lg font-bold shadow lg:hidden"
          >
            ×
          </button>
        ) : null}
      </div>
      {!isDesktop && !mobileMapOpen ? (
        <button
          type="button"
          onClick={handleOpenMobileMap}
          className="fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full border bg-black px-5 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
        >
          Map
        </button>
      ) : null}
    </div>
  );
}
