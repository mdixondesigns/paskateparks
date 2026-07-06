"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { NearbyCard, type NearbyCardItem } from "@/components/park/NearbyCard";
import { findNearby } from "@/lib/nearby";
import type { HomeParkRow } from "@/lib/park-query";

import { NearMeButton, type GeoErrorReason } from "./NearMeButton";

// Phase 6 D1 + D2 + D3 + D5 + CMT-2 — homepage client island.
//
// State composition:
//
//   parks (alphabetical from RSC)  ─┐
//   filter (free text)             ─┼─►  filtered = parks.filter(matchFilter)
//   userLocation | mapCenter | -   ─┘
//                                       │
//   filtered                            │  Sort precedence:
//   userLocation, mapCenter ────────────┴─►  userLocation → byDistance(filtered, userLocation)
//                                            mapCenter    → byDistance(filtered, mapCenter)
//                                            -            → alphabetical (already alpha from server)
//
// CMT-2 lock: when filter AND a sort origin are active, sort applies WITHIN
// the filtered set, not the global set. Preserves user search context.
//
// Phase 10 — userLocation lifted to SyncedMapList so map flyTo + blue dot
// + list sort share one source. mapCenter is fed from the map's moveend so
// the list re-orders as the user pans, no bbox filtering, no "Search this
// area" button. userLocation wins if both are set (user proximity is the
// stronger intent).

const ABOVE_FOLD_PRIORITY_COUNT = 3;

interface Props {
  parks: HomeParkRow[];
  /** Lifted to the parent (SyncedMapList). When set, the list sorts by
   *  distance from this point and shows distance pills. Wins over mapCenter. */
  userLocation?: { lat: number; lng: number } | null;
  /** Map center from the last moveend. When set (and userLocation is null),
   *  the list sorts by distance from here. No pills — too noisy as the user
   *  pans. Sort-only, never filter. */
  mapCenter?: { lat: number; lng: number } | null;
  /** Forwarded up to SyncedMapList so both the list sort AND the map's blue
   *  dot react to the same NearMe button click. Optional — standalone uses
   *  (none today, but kept for parity with NearMeButton's contract) fall
   *  back to a noop. */
  onLocation?: (lat: number, lng: number) => void;
  onError?: (reason: GeoErrorReason) => void;
  /** Restored 2026-07-06 — when the wrapper's bbox filter yields zero
   *  coordinate-having parks in view (but `parks` itself is non-empty),
   *  it passes this override to render bbox-specific empty copy + a "See
   *  all parks" action, instead of HomeParkList's own two default empty
   *  branches (DB-empty / text-filter-empty). Rendered only when supplied
   *  AND this component's own `items.length === 0` — HomeParkList stays
   *  mounted at all times (never unmounted for bbox-emptiness) so its
   *  internal filter/geoError state survives every pan. */
  emptyStateOverride?: ReactNode;
}

function matchesFilter(park: HomeParkRow, q: string): boolean {
  // Trim first — Android software keyboards routinely insert a trailing space
  // after autocomplete, which otherwise turns a 3-char query into a no-match.
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    park.name.toLowerCase().includes(needle) ||
    park.city.toLowerCase().includes(needle) ||
    (park.alias?.toLowerCase().includes(needle) ?? false)
  );
}

function geoErrorMessage(reason: GeoErrorReason | null): string | null {
  if (reason === null) return null;
  if (reason === "denied") {
    return "Location access denied. Use the filter above to find your area.";
  }
  if (reason === "timeout") {
    return "Couldn't get a location fix in time. Try again, or use the filter.";
  }
  if (reason === "invalid") {
    return "Got an unusual location response. Try again.";
  }
  return "Couldn't get your location. Try again, or use the filter.";
}

function pluralize(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

// Single shape converter so the call sites don't drift. Distance is omitted
// when undefined (D6 widening; also when mapCenter sort is the origin —
// distance from map center isn't useful info per-card).
function toCardItem(
  p: HomeParkRow,
  extras: { distanceMiles?: number; priority?: boolean } = {},
): NearbyCardItem {
  return {
    id: p.id,
    name: p.name,
    city: p.city,
    state: p.state,
    href: `/park/${p.slug}`,
    thumbStoragePath: p.heroPhotoPath,
    ...(extras.distanceMiles !== undefined ? { distanceMiles: extras.distanceMiles } : {}),
    ...(extras.priority ? { priority: true } : {}),
  };
}

export function HomeParkList({
  parks,
  userLocation,
  mapCenter,
  onLocation,
  onError,
  emptyStateOverride,
}: Props) {
  const [filter, setFilter] = useState("");
  const [geoError, setGeoError] = useState<GeoErrorReason | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function handleLocation(lat: number, lng: number) {
    setGeoError(null);
    onLocation?.(lat, lng);
  }

  function handleGeoError(reason: GeoErrorReason) {
    setGeoError(reason);
    onError?.(reason);
  }

  // P1-A: scroll the list into view once React has committed the re-sorted DOM
  // after a fresh geolocation grant. Only fires on transitions to a non-null
  // userLocation (the first grant); subsequent ref changes from the parent
  // don't re-scroll.
  const lastUserLocRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (
      userLocation &&
      (lastUserLocRef.current?.lat !== userLocation.lat ||
        lastUserLocRef.current?.lng !== userLocation.lng)
    ) {
      lastUserLocRef.current = userLocation;
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!userLocation) {
      lastUserLocRef.current = null;
    }
  }, [userLocation]);

  // Filter + sort composition. Both pipelines are O(n) on 48 rows; no memo
  // gymnastics needed. useMemo only because it makes the dataflow explicit
  // and avoids recomputing on unrelated re-renders.
  const items = useMemo<NearbyCardItem[]>(() => {
    const filtered = parks.filter((p) => matchesFilter(p, filter));

    // Sort origin precedence: userLocation > mapCenter > alphabetical.
    const sortOrigin = userLocation ?? mapCenter ?? null;
    if (sortOrigin) {
      const sorted = findNearby(sortOrigin, filtered, {
        limit: filtered.length,
        maxMiles: Number.POSITIVE_INFINITY,
      });
      const sortedIds = new Set(sorted.map((s) => s.id));
      const noCoords = filtered.filter((p) => !sortedIds.has(p.id));
      // Distance pills are only meaningful for the userLocation case
      // ("how far am I from this park?"). mapCenter pan would change pills
      // continuously — distracting. Suppress when the origin is mapCenter.
      const showDistance = userLocation !== null && userLocation !== undefined;
      const union = [
        ...sorted.map((p) => ({
          park: p as HomeParkRow,
          distance: showDistance ? p.distanceMiles : undefined,
        })),
        ...noCoords.map((p) => ({ park: p, distance: undefined as number | undefined })),
      ];
      return union.map(({ park, distance }, idx) =>
        toCardItem(park, {
          distanceMiles: distance,
          priority: idx < ABOVE_FOLD_PRIORITY_COUNT,
        }),
      );
    }

    // Alphabetical (default). First 3 above-the-fold cards get LCP priority.
    return filtered.map((p, idx) =>
      toCardItem(p, { priority: idx < ABOVE_FOLD_PRIORITY_COUNT }),
    );
  }, [parks, filter, userLocation, mapCenter]);

  const countLabel = pluralize(items.length, "park");
  const status: string =
    userLocation
      ? `Showing ${countLabel} nearest to you${filter ? ` matching "${filter}"` : ""}.`
      : filter
        ? `Showing ${countLabel} matching "${filter}".`
        : `Showing ${countLabel}.`;

  return (
    <section aria-labelledby="park-list-heading" className="px-4 py-4">
      {/* tabIndex={-1} restored 2026-07-06 — makes this a valid, non-tab-order
          focus target so "See all parks" (SyncedMapList) can move focus here
          after a bbox reset instead of losing it to <body>. */}
      <h2
        id="park-list-heading"
        tabIndex={-1}
        className="text-xs font-bold uppercase tracking-wider"
      >
        {userLocation ? "Nearest to you" : "All Pennsylvania skateparks"}
      </h2>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Filter parks by name or city</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or city"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </label>
        <NearMeButton onLocation={handleLocation} onError={handleGeoError} />
      </div>

      {/* P1-A: announce sort/filter state changes. aria-live=polite so it
          doesn't interrupt the user mid-typing. */}
      <div role="status" aria-live="polite" className={status ? "mt-2 text-sm" : "sr-only"}>
        {status}
      </div>

      {geoError ? (
        <p className="mt-2 text-sm" role="alert">
          {geoErrorMessage(geoError)}
        </p>
      ) : null}

      {items.length === 0 ? (
        // Three empty states, discriminated on `parks` (the incoming prop)
        // rather than `items` (the post-text-filter result) — CRITICAL:
        // this keeps a text-filter miss on a non-empty `parks` set from
        // ever showing the bbox-empty override, even if a caller passes
        // one (restored 2026-07-06; see HomeParkList.test.tsx's regression
        // guard). (1) `parks` itself empty + override supplied → bbox-empty
        // copy. (2) `parks` itself empty, no override → DB genuinely empty.
        // (3) `parks` non-empty but text filter matched nothing → filter
        // copy, regardless of any override prop.
        parks.length === 0 ? (
          (emptyStateOverride ?? (
            <p className="mt-4 text-sm">
              No parks available right now. Check back soon.
            </p>
          ))
        ) : (
          <p className="mt-4 text-sm">
            No parks match &ldquo;{filter.trim()}&rdquo;. Try a different term, or clear the filter.
          </p>
        )
      ) : (
        <ol ref={listRef} role="list" className="mt-2 border-y">
          {items.map((item) => (
            // Key on the stable park identity (href = /park/<slug>) so geo
            // re-sort reorders existing DOM nodes instead of unmounting and
            // remounting every card — which would re-request lazy thumbnails
            // and re-decode the priority ones.
            <NearbyCard key={item.href ?? item.name} item={item} />
          ))}
        </ol>
      )}
    </section>
  );
}
