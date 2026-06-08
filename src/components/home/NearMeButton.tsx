"use client";

import { useEffect, useRef } from "react";

import { geoButtonLabels, useGeolocation, type GeoErrorReason } from "@/lib/use-geolocation";

// Phase 6 D8 + D10 + P1-B + P1-E — homepage "Find parks near me" button.
//
// Phase 7 refactor: the geolocation state machine + bounds check + D10 options
// now live in `useGeolocation` (src/lib/use-geolocation.ts) so this component
// and /map/'s floating Find-me control share one tested module. The component
// stays a thin presentation layer that bridges hook state to the parent's
// callback API (onLocation, onError) — preserving phase-6's external contract
// so HomeParkList doesn't need to change.
//
// Locked copy per P1-E:
//   idle    → "Find parks near me"
//   pending → "Finding your location…"
//   denied  → "Location unavailable — use the filter"
//   error   → "Couldn't get location — try again"

export type { GeoErrorReason };

export interface NearMeButtonProps {
  /** Called with valid, bounds-checked coordinates after a successful fix. */
  onLocation: (lat: number, lng: number) => void;
  /** Called when the user denies, the request times out, or the response is invalid. */
  onError: (reason: GeoErrorReason) => void;
}

// Phase 7: label factory lives in use-geolocation so both consumers (this
// button + /map/'s floating Find-me) share the locked idle/pending/error
// copy and only the denied-state CTA suffix differs per surface.
const LABELS = geoButtonLabels("use the filter");

export function NearMeButton({ onLocation, onError }: NearMeButtonProps) {
  const geo = useGeolocation();
  // Track the last delivered values so we only fire callbacks on transitions,
  // not on unrelated re-renders. Refs (not state) keep the bridge effects from
  // looping on themselves.
  //
  // Note on the value-equality check below: if the user re-taps and the
  // browser returns the cached same-coords fix (likely given D10's
  // maximumAge: 60_000), `geo.location` is a new object reference but the
  // lat/lng numbers are identical. We skip onLocation in that case because
  // HomeParkList's sort is idempotent for identical coords — re-firing would
  // re-run the same Haversine pass with no observable effect.
  const lastLocation = useRef<{ lat: number; lng: number } | null>(null);
  const lastError = useRef<GeoErrorReason | null>(null);

  useEffect(() => {
    if (
      geo.location &&
      (lastLocation.current?.lat !== geo.location.lat ||
        lastLocation.current?.lng !== geo.location.lng)
    ) {
      lastLocation.current = geo.location;
      onLocation(geo.location.lat, geo.location.lng);
    }
  }, [geo.location, onLocation]);

  useEffect(() => {
    if (geo.error && geo.error !== lastError.current) {
      lastError.current = geo.error;
      onError(geo.error);
    } else if (!geo.error) {
      lastError.current = null;
    }
  }, [geo.error, onError]);

  if (!geo.supported) return null;

  // Disabled rule lives in useGeolocation now — single source of truth for
  // both this button and /map/'s floating Find-me.
  return (
    <button
      type="button"
      onClick={geo.request}
      disabled={geo.disabled}
      aria-busy={geo.status === "pending"}
      className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {LABELS[geo.status]}
    </button>
  );
}
