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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { boundsChanged, filterByBbox, type LatLngBoundsLike } from "@/lib/bbox-filter";
import { hasCoords } from "@/lib/has-coords";
import type { HomeParkRow, MapParkRow } from "@/lib/park-query";
import { useMapUrlState } from "@/lib/use-map-url-state";

import { HomeParkList } from "./HomeParkList";

import type { MapMoveEnd } from "@/components/map/MapView";

// .card-flash class is added for FLASH_MS, then removed. Re-applying the
// class on rapid consecutive clicks requires removing+re-adding (browsers
// won't restart a CSS animation on a no-op class addition); the effect's
// timer cleanup handles this case — a new selection clears the prior timer
// + the prior card's class before applying to the new card.
const FLASH_MS = 1500;

// Mobile breakpoint mirrors Tailwind's `lg:` (1024px). Desktop renders the
// two-pane synced layout; below it we render list-only with a Map pill
// that opens a full-screen overlay (T8 lazy-mount).
const DESKTOP_MIN_PX = 1024;

// Click-sync direction asymmetry (per the T6 implementation note):
//   marker click  →  scroll + flash the matching list card (implemented)
//   list card click  →  navigates to /park/<slug> (unchanged)
//
// The plan's "bidirectional click sync" can't be implemented without
// breaking the existing navigate-on-click UX. Hover sync (D3.3) was
// deferred for the same reason — separate decision when design-review
// revisits the desktop interaction model.

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
  // T6 — selectedParkId drives marker → list-card sync. Marker click sets
  // it → the scrollToSelectedCard effect below scrolls the matching list
  // card into view and adds .card-flash for 1500ms.
  const [selectedParkId, setSelectedParkId] = useState<number | null>(null);
  // Ref to the list-pane container — scoped DOM lookup keeps the
  // querySelector inside this wrapper (no global document scan).
  const listContainerRef = useRef<HTMLDivElement>(null);
  // Cleanup ref for the in-flight flash timer + the element it's flashing.
  // Holding the element lets the next selection clean up the prior flash
  // class before adding a new one (rapid-fire click safety).
  const flashStateRef = useRef<{ el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);

  // T3 — URL state for shareable map views. On cold load, `initialView`
  // (if present) wins over the default fit-bounds; `filteredFromUrl` means
  // the sender had the bbox filter on, so we auto-apply on first render.
  const { initialView, filteredFromUrl, writeViewport, setUserDriven } = useMapUrlState();

  // T7 — bbox filter state. null = filter inactive (list shows all parks).
  // LatLngBoundsLike = active, scoped to those bounds. Set by "Search this
  // area" button. Cleared by "See all" chip. URL `filtered=1` on load
  // triggers an initial apply using initialView's implied bounds (the map
  // hasn't fired moveend yet at that point, so we resolve via a one-shot
  // effect after first moveend).
  const [bboxFilter, setBboxFilter] = useState<LatLngBoundsLike | null>(null);
  // Latest bounds from the map (set on every moveend, user or programmatic).
  // Used by the "Search this area" button — when clicked, this becomes
  // bboxFilter. Also feeds the URL writer so the URL reflects what the
  // map currently shows even before the user opts into the filter.
  const [currentBounds, setCurrentBounds] = useState<LatLngBoundsLike | null>(null);
  // Last bounds where the bbox filter was COMMITTED. boundsChanged() compares
  // current vs this to decide whether "Search this area" should be visible.
  const lastCommittedBoundsRef = useRef<LatLngBoundsLike | null>(null);
  // One-shot flag: true while we're waiting for the first user-driven
  // moveend to apply the URL's `filtered=1` to the initial map bounds.
  const pendingUrlFilterRef = useRef<boolean>(filteredFromUrl);
  // The next moveend(s) come from a programmatic action (initial fit,
  // marker click → cluster zoom). Some animations fire multiple moveends
  // (markercluster's zoom animation in particular), so this is a TIMED
  // window: when set true, it auto-clears 800ms later. Within the window,
  // every moveend is treated as programmatic. handleMoveEnd does not
  // reset the ref — only the timer does.
  const expectingProgrammaticMoveRef = useRef<boolean>(true);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PROGRAMMATIC_MOVE_WINDOW_MS = 800;

  // T8 — mobile lazy-mount. `mobileMapOpen` controls the overlay
  // visibility; `mobileMapEverOpened` becomes true on first tap and stays
  // true so the map stays mounted across subsequent close/reopen cycles
  // (no Leaflet re-init cost on the second open). Cold mobile load: both
  // are false → no Leaflet in the network tab at all.
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [mobileMapEverOpened, setMobileMapEverOpened] = useState(false);
  // Desktop breakpoint state. Defaults to true for SSR so the desktop
  // markup matches on first paint; the effect below corrects mobile after
  // hydration. matchMedia listener keeps it current on viewport resize.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`);
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

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

  // T7 — apply the bbox filter to the parks list. Wrapper composes the
  // filter ABOVE HomeParkList (E3 — list contract unchanged). HomeParkList
  // still does freetext + distance-sort on whatever it receives.
  const filteredParks = useMemo(
    () => (bboxFilter ? filterByBbox(parks, bboxFilter) : parks),
    [parks, bboxFilter],
  );

  // Show the "Search this area" button when the current bounds differ
  // meaningfully from the last committed bounds (or from the initial state
  // before any commit). User panned/zoomed enough that the visible area
  // doesn't match what's in the list.
  const showSearchThisArea = useMemo(
    () => currentBounds !== null && boundsChanged(lastCommittedBoundsRef.current, currentBounds),
    [currentBounds],
  );

  // T6 — when selectedParkId changes (from a marker click via onMarkerClick),
  // find the matching list card by data-park-id, scroll it into view, and
  // apply .card-flash for 1500ms. Null id means a clear/reset — undo any
  // in-flight flash.
  useEffect(() => {
    // Always clean up the prior flash before doing anything else (handles
    // rapid-fire clicks and the unselect path).
    if (flashStateRef.current) {
      clearTimeout(flashStateRef.current.timer);
      flashStateRef.current.el.classList.remove("card-flash");
      flashStateRef.current = null;
    }
    if (selectedParkId == null) return;
    const root = listContainerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-park-id="${selectedParkId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("card-flash");
    const timer = setTimeout(() => {
      el.classList.remove("card-flash");
      if (flashStateRef.current?.el === el) flashStateRef.current = null;
    }, FLASH_MS);
    flashStateRef.current = { el, timer };
  }, [selectedParkId]);

  // Cleanup on unmount — any pending flash timer must not fire after
  // SyncedMapList is gone (the el ref would be stale).
  useEffect(() => {
    return () => {
      if (flashStateRef.current) {
        clearTimeout(flashStateRef.current.timer);
        flashStateRef.current.el.classList.remove("card-flash");
        flashStateRef.current = null;
      }
    };
  }, []);

  // Open a window where moveends are treated as programmatic. Idempotent —
  // calling during an existing window resets the timer.
  const beginProgrammaticMoveWindow = useCallback(() => {
    expectingProgrammaticMoveRef.current = true;
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current = setTimeout(() => {
      expectingProgrammaticMoveRef.current = false;
      programmaticTimerRef.current = null;
    }, PROGRAMMATIC_MOVE_WINDOW_MS);
  }, []);

  // Initial mount: open the window so the very first moveend (from
  // MapView's initial setView/fitBounds) lands inside it.
  useEffect(() => {
    beginProgrammaticMoveWindow();
    return () => {
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    };
  }, [beginProgrammaticMoveWindow]);

  const handleMarkerClick = useCallback(
    (id: number) => {
      // The selectedParkId change below triggers MapView's effect to call
      // cluster.zoomToShowLayer, which fires MULTIPLE moveends during the
      // zoom animation. Open the programmatic window so every one of them
      // is treated as programmatic until the animation completes.
      beginProgrammaticMoveWindow();
      setSelectedParkId(id);
    },
    [beginProgrammaticMoveWindow],
  );

  // T5 + T7 — moveend feeds three concerns: bbox filter visibility, URL
  // state writes, and the pending-URL-filter auto-apply. The wrapper —
  // not MapView — decides whether a given moveend is user-driven, by
  // tracking which moves IT initiated via expectingProgrammaticMoveRef.
  const handleMoveEnd = useCallback(
    (event: MapMoveEnd) => {
      setCurrentBounds(event.bounds);
      const isProgrammatic = expectingProgrammaticMoveRef.current;
      // NOTE: we do NOT reset the ref here — the timer in
      // beginProgrammaticMoveWindow handles that. Multiple moveends
      // during an animation (markercluster zoom) all land in the same
      // window and are correctly treated as programmatic.
      if (pendingUrlFilterRef.current) {
        pendingUrlFilterRef.current = false;
        setBboxFilter(event.bounds);
        lastCommittedBoundsRef.current = event.bounds;
        return;
      }
      if (isProgrammatic) {
        // Continuously update the baseline during a programmatic window
        // so the LAST moveend wins (animations settle at the final view).
        lastCommittedBoundsRef.current = event.bounds;
        return;
      }
      // Real user pan/zoom — write URL (debounced), let the "Search this
      // area" button surface via boundsChanged comparison.
      setUserDriven(true);
      writeViewport({ lat: event.lat, lng: event.lng, zoom: event.zoom }, bboxFilter !== null);
    },
    [setUserDriven, writeViewport, bboxFilter],
  );

  // T7 — "Search this area" click: commit the current bounds as the active
  // filter, then write the URL with filtered=1.
  const handleSearchThisArea = useCallback(() => {
    if (!currentBounds) return;
    setBboxFilter(currentBounds);
    lastCommittedBoundsRef.current = currentBounds;
    // Force the URL write with filtered=1 even though this isn't a moveend.
    // setUserDriven(true) is already in place from the user's prior pan;
    // the writeViewport's `filtered` arg flips on.
    // We need a view to write; use the current bounds' center as a proxy.
    const centerLat = (currentBounds.south + currentBounds.north) / 2;
    const centerLng = (currentBounds.west + currentBounds.east) / 2;
    // Zoom isn't known here — the URL written on the last user moveend
    // is correct; this just appends/sets filtered=1. writeViewport's
    // debounce will collapse a rapid sequence.
    setUserDriven(true);
    writeViewport({ lat: centerLat, lng: centerLng, zoom: 10 }, true);
  }, [currentBounds, setUserDriven, writeViewport]);

  // T7 — "See all" reset: clear bbox filter, drop filtered=1 from URL.
  // Doesn't programmatically fit the map back to all-PA (the wrapper
  // doesn't currently own a fitBounds API on MapView). The list just
  // un-filters; the user can pan or zoom out separately.
  // ponytail: not auto-fitting the map back is a deliberate shortcut —
  // simpler UX, no map jump. If users complain "I want to see all parks
  // on the map after See all," add a fitToAllParksRequest prop to
  // MapView and wire it here.
  const handleSeeAll = useCallback(() => {
    setBboxFilter(null);
    lastCommittedBoundsRef.current = null;
    setUserDriven(true);
    if (currentBounds) {
      const centerLat = (currentBounds.south + currentBounds.north) / 2;
      const centerLng = (currentBounds.west + currentBounds.east) / 2;
      writeViewport({ lat: centerLat, lng: centerLng, zoom: 10 }, false);
    }
  }, [currentBounds, setUserDriven, writeViewport]);

  const filterStatus = bboxFilter
    ? filteredParks.length === 0
      ? "No parks in this area — pan or zoom out to see more."
      : `Showing ${filteredParks.length} of ${parks.length} parks in this area.`
    : null;

  // T8 — mobile map should be rendered (and Leaflet loaded) only if the
  // user has actually opened it at least once, OR we're on desktop. On
  // mobile cold load this is false → MapView is unmounted → next/dynamic
  // never imports Leaflet → no JS in the network tab. After first tap
  // it flips true and stays true (re-mounting on subsequent opens would
  // throw away the user's pan/zoom state — bad UX).
  const shouldMountMap = isDesktop || mobileMapEverOpened;

  const handleOpenMobileMap = useCallback(() => {
    // First open mounts MapView for the first time, which runs its init
    // effect and fires moveend during initial fitBounds. That moveend is
    // programmatic, not a user pan — open a fresh window so handleMoveEnd
    // doesn't show "Search this area" or write the URL for it.
    beginProgrammaticMoveWindow();
    setMobileMapEverOpened(true);
    setMobileMapOpen(true);
  }, [beginProgrammaticMoveWindow]);
  const handleCloseMobileMap = useCallback(() => {
    setMobileMapOpen(false);
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[2fr_3fr] lg:gap-0">
      {/* List pane. Hidden when the mobile overlay is open so users see
          only the map (the overlay covers it, but display:none also drops
          the list from the tab order and screen-reader DOM during that
          window). On desktop the list always shows. */}
      <div
        ref={listContainerRef}
        className={`lg:max-h-[100dvh] lg:overflow-y-auto ${mobileMapOpen ? "hidden lg:block" : ""}`}
      >
        {/* T7 — bbox-filter status + reset chip. Visible UI for sighted
            users; the SAME copy is also piped into HomeParkList's existing
            role="status" aria-live region via the bboxStatus prop (T11),
            so screen readers get the announcement on state change. We do
            not add a second aria-live region here — multiple live regions
            race each other and SRs may drop one or both announcements. */}
        {filterStatus ? (
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm">
            <span aria-hidden="true">{filterStatus}</span>
            <button
              type="button"
              onClick={handleSeeAll}
              className="rounded border px-2 py-1 text-xs font-medium hover:bg-gray-50"
            >
              See all
            </button>
          </div>
        ) : null}
        <HomeParkList parks={filteredParks} bboxStatus={filterStatus} />
      </div>
      {/* Map pane. Desktop: sticky right column. Mobile: fixed full-screen
          overlay when mobileMapOpen, hidden otherwise. We use a class
          override (not unmount) so the map keeps its pan/zoom state across
          close/reopen cycles on mobile. shouldMountMap gates whether
          MapView is even rendered (mobile cold load: not rendered). */}
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
            selectedParkId={selectedParkId}
            onMarkerClick={handleMarkerClick}
            onMoveEnd={handleMoveEnd}
          />
        ) : null}
        {/* T7 — "Search this area" button floats over the map, top-center.
            Visible when the user has panned/zoomed past the bounds-change
            threshold AND there's a current bounds to commit. */}
        {showSearchThisArea ? (
          <button
            type="button"
            onClick={handleSearchThisArea}
            className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border bg-white px-4 py-2 text-sm font-medium shadow"
          >
            Search this area
          </button>
        ) : null}
        {/* T8 — mobile close (X). Visible only when the mobile overlay is
            open. Desktop never sees this. */}
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
      {/* T8 — mobile Map pill. Visible only on mobile when overlay is
          closed. Sticky bottom-center floats over the list. */}
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
