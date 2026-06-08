"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

// Phase 7 — geolocation state machine extracted from NearMeButton (phase 6).
// Two consumers as of this commit: the homepage Find-Me button and the /map/
// floating control. Single tested module for the D10 timeout/maximumAge
// options and the P1-B bounds check, so a future tweak only happens here.
//
//   ┌─ useGeolocation state machine ──────────────────────────────────┐
//   │                                                                 │
//   │   idle  ──request──►  pending  ──success──► idle + location set │
//   │    ▲                    │                          │            │
//   │    │                    ├──PERMISSION_DENIED──► denied  ──┐     │
//   │    │                    │                                 │     │
//   │    │                    ├──TIMEOUT────────────► error  ───┤     │
//   │    │                    │                                 │     │
//   │    │                    ├──POSITION_UNAVAILABLE─► error ──┤     │
//   │    │                    │                                 │     │
//   │    │                    └──invalid coords (P1-B)─► error ─┤     │
//   │    │                                                      │     │
//   │    └─────────────────  request() again  ─────────────────┘     │
//   │                                                                 │
//   │   supported=false → consumer renders nothing                    │
//   └─────────────────────────────────────────────────────────────────┘

export type GeoStatus = "idle" | "pending" | "denied" | "error";
export type GeoErrorReason = "denied" | "timeout" | "unavailable" | "invalid";

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface UseGeolocationResult {
  /** True once mounted client-side AND navigator.geolocation exists. SSR-safe. */
  supported: boolean;
  status: GeoStatus;
  /** Last successful fix, or null. Never partial. */
  location: GeoLocation | null;
  /** Last error reason, or null. */
  error: GeoErrorReason | null;
  /** Trigger a new getCurrentPosition request. Noop when unsupported. */
  request: () => void;
  /**
   * Convenience: true when the consumer should disable the Find-me button —
   * either a request is in flight (pending) or the user denied permission
   * (sticky; re-tapping won't re-prompt). "error" states (timeout, etc.)
   * stay clickable for retry. Derived in one place so both consumers
   * (homepage NearMeButton + /map/ floating button) can't drift.
   */
  disabled: boolean;
}

/**
 * Locked button copy per P1-E. Consumers parameterize the denied-state CTA so
 * each surface can point users to its own fallback affordance ("use the
 * filter" on the homepage, "use the list" on /map/). Idle/pending/error copy
 * is identical across consumers to keep the geo state machine recognizable.
 */
export type GeoButtonLabels = Record<GeoStatus, string>;

export function geoButtonLabels(deniedFallbackCta: string): GeoButtonLabels {
  return {
    idle: "Find parks near me",
    pending: "Finding your location…",
    denied: `Location unavailable — ${deniedFallbackCta}`,
    error: "Couldn't get location — try again",
  };
}

// Feature-detect via useSyncExternalStore. Returns false on the SSR snapshot
// (matches the server HTML — no hydration mismatch) and the actual boolean on
// the client after mount. Avoids the react-hooks/set-state-in-effect lint
// error that the older useEffect+setState pattern triggered in React 19.
const noopSubscribe = () => () => {};
const getGeoSnapshot = () => typeof navigator !== "undefined" && !!navigator.geolocation;
const getGeoServerSnapshot = () => false;

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function useGeolocation(): UseGeolocationResult {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<GeoErrorReason | null>(null);
  const supported = useSyncExternalStore(noopSubscribe, getGeoSnapshot, getGeoServerSnapshot);

  const request = useCallback(() => {
    if (!supported) return;
    setStatus("pending");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!isValidCoord(latitude, longitude)) {
          setStatus("error");
          setError("invalid");
          // Don't clear last-known location on a bad new fix.
          return;
        }
        // Set status and location together so consumers that watch `location`
        // see the new fix in the same render (status is back to idle, button
        // re-reads "Find parks near me" for the next tap).
        setStatus("idle");
        setLocation({ lat: latitude, lng: longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setError("denied");
        } else if (err.code === err.TIMEOUT) {
          setStatus("error");
          setError("timeout");
        } else {
          setStatus("error");
          setError("unavailable");
        }
      },
      {
        timeout: 10_000,
        maximumAge: 60_000,
        enableHighAccuracy: false,
      },
    );
  }, [supported]);

  // "denied" is sticky — re-tapping won't reshow the browser prompt.
  // "pending" disables to prevent double-fires while the GPS resolves.
  // "error" stays clickable (timeout / unavailable are transient).
  const disabled = status === "pending" || status === "denied";

  return { supported, status, location, error, request, disabled };
}
