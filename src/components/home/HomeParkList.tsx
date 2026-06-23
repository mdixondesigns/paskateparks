"use client";

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
//   userLocation (or null)         ─┘
//                                       │
//   filtered  ─┐                        │
//   userLoc   ─┴──► sorted = userLoc                ┌─ alphabetical (default)
//                              ? byDistance(filtered)
//                              : filtered           └─ already alpha from server
//
// CMT-2 lock: when both filter AND geo are active, we sort WITHIN the filtered
// set, not the global set. Preserves user search context across geo grant.
//
// P1-A: when sorted-by-distance kicks in we (1) scroll the list into view, and
// (2) the polite aria-live region announces the change to screen readers.

const ABOVE_FOLD_PRIORITY_COUNT = 3;

interface Props {
  parks: HomeParkRow[];
  /**
   * T11 — synced map+list wrapper composes the bbox-filter status into
   * HomeParkList's existing aria-live region instead of rendering its own.
   * Two aria-live regions race each other and screen readers may drop one
   * or both announcements. When set, this string is appended after the
   * geolocation/filter status with a separating space, both rendered into
   * the single role="status" region below.
   *
   * Park-profile callers and standalone uses leave this undefined.
   */
  bboxStatus?: string | null;
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

// Single shape converter so the three call sites (sorted, no-coords append,
// alpha default) don't drift. Distance is omitted when undefined (D6 widening).
// id is always passed so SyncedMapList can query the card by data-park-id for
// the marker → list click sync. (Cards on /park/[slug] don't go through this
// converter, so they correctly stay sync-inert with no data-park-id attr.)
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

export function HomeParkList({ parks, bboxStatus }: Props) {
  const [filter, setFilter] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<GeoErrorReason | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function handleLocation(lat: number, lng: number) {
    setUserLocation({ lat, lng });
    setGeoError(null);
  }

  function handleGeoError(reason: GeoErrorReason) {
    setGeoError(reason);
    setUserLocation(null);
  }

  // P1-A: scroll the list into view once React has committed the re-sorted DOM.
  // useEffect runs AFTER commit; a microtask scheduled inside handleLocation
  // would have fired BEFORE the new list was laid out, scrolling to the stale
  // position. Cleanup is a noop — the smooth-scroll completes on its own.
  useEffect(() => {
    if (userLocation) {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [userLocation]);

  // Filter + sort composition. Both pipelines are O(n) on 48 rows; no memoization
  // gymnastics needed. useMemo only because it makes the dataflow explicit and
  // avoids recomputing on unrelated re-renders.
  const items = useMemo<NearbyCardItem[]>(() => {
    const filtered = parks.filter((p) => matchesFilter(p, filter));

    if (userLocation) {
      // findNearby drops parks with NULL lat/lng — phase 6 has none currently,
      // but the helper handles it defensively (STACK-PIVOT.md finding #2).
      // No distance cap: homepage shows global sort.
      const sorted = findNearby(userLocation, filtered, {
        limit: filtered.length,
        maxMiles: Number.POSITIVE_INFINITY,
      });
      // Parks without coords get appended after the sorted-by-distance set so
      // they don't disappear entirely from a filtered search.
      const sortedIds = new Set(sorted.map((s) => s.id));
      const noCoords = filtered.filter((p) => !sortedIds.has(p.id));
      // Compute priority across the UNION so the first 3 visible cards always
      // get LCP priority regardless of which branch produced them (avoids the
      // edge case where a tight filter yields <3 sorted items and the no-coord
      // appendees occupy the above-the-fold slots without priority).
      const union = [
        ...sorted.map((p) => ({ park: p as HomeParkRow, distance: p.distanceMiles })),
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
  }, [parks, filter, userLocation]);

  const countLabel = pluralize(items.length, "park");
  const baseStatus: string =
    userLocation !== null
      ? `Showing ${countLabel} nearest to you${filter ? ` matching "${filter}"` : ""}.`
      : filter
        ? `Showing ${countLabel} matching "${filter}".`
        : "";
  // T11: single aria-live region announces both the in-list filter/sort
  // state AND the wrapper-owned bbox filter. Joined with a space when both
  // are present; either alone renders cleanly.
  const status: string = [baseStatus, bboxStatus ?? ""].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="park-list-heading" className="px-4 py-4">
      <h2 id="park-list-heading" className="text-xs font-bold uppercase tracking-wider">
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
        // Two distinct empty states — without this branch, a DB returning zero
        // parks would render the nonsense "No parks match ''" copy with no
        // filter to clear.
        parks.length === 0 ? (
          <p className="mt-4 text-sm">
            No parks available right now. Check back soon.
          </p>
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
