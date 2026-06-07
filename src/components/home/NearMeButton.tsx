"use client";

import { useState, useSyncExternalStore } from "react";

// Phase 6 D8 + D10 + P1-B + P1-E — geolocation client component.
//
//   ┌─ NearMeButton state machine ────────────────────────────────────┐
//   │                                                                 │
//   │   idle  ──click──►  pending  ──success──►  (lift via onLocation)│
//   │    ▲                  │                                          │
//   │    │                  ├──permission denied──►  denied  ──┐       │
//   │    │                  │                                  │       │
//   │    │                  ├──timeout (10s)──────►  error  ───┤       │
//   │    │                  │                                  │       │
//   │    │                  └──other position error─►  error  ─┤       │
//   │    │                                                     │       │
//   │    └─────────────────  click again  ─────────────────────┘       │
//   │                                                                 │
//   │   unsupported = component returns null (no button rendered)     │
//   └─────────────────────────────────────────────────────────────────┘
//
// Locked copy per P1-E:
//   idle    → "Find parks near me"
//   pending → "Finding your location…"
//   denied  → "Location unavailable — use the filter"
//   error   → "Couldn't get location — try again"
//
// Bounds check per P1-B: latitude in [-90, 90], longitude in [-180, 180], both finite.

export type GeoErrorReason = "denied" | "timeout" | "unavailable" | "invalid";

export interface NearMeButtonProps {
  /** Called with valid, bounds-checked coordinates after a successful fix. */
  onLocation: (lat: number, lng: number) => void;
  /** Called when the user denies, the request times out, or the response is invalid. */
  onError: (reason: GeoErrorReason) => void;
}

type State = "idle" | "pending" | "denied" | "error";

const LABELS: Record<State, string> = {
  idle: "Find parks near me",
  pending: "Finding your location…",
  denied: "Location unavailable — use the filter",
  error: "Couldn't get location — try again",
};

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

// Feature-detect via useSyncExternalStore. Returns false on the SSR snapshot
// (matches the server HTML — no hydration mismatch) and the actual boolean on
// the client after mount. Avoids the `react-hooks/set-state-in-effect` lint
// error that the older useEffect+setState pattern triggered in React 19.
const noopSubscribe = () => () => {};
const getGeoSnapshot = () => typeof navigator !== "undefined" && !!navigator.geolocation;
const getGeoServerSnapshot = () => false;

export function NearMeButton({ onLocation, onError }: NearMeButtonProps) {
  const [state, setState] = useState<State>("idle");
  const supported = useSyncExternalStore(noopSubscribe, getGeoSnapshot, getGeoServerSnapshot);

  if (!supported) return null;

  function handleClick() {
    setState("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!isValidCoord(latitude, longitude)) {
          setState("error");
          onError("invalid");
          return;
        }
        // Don't clear state to "idle" — if user re-taps after granting, the
        // browser permission is sticky and the call resolves fast. We stay
        // "idle" so the button reads "Find parks near me" again (lets them
        // refresh their position).
        setState("idle");
        onLocation(latitude, longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState("denied");
          onError("denied");
        } else if (err.code === err.TIMEOUT) {
          setState("error");
          onError("timeout");
        } else {
          setState("error");
          onError("unavailable");
        }
      },
      {
        timeout: 10_000,
        maximumAge: 60_000,
        enableHighAccuracy: false,
      },
    );
  }

  // Once denied, the browser permission is sticky — re-tapping won't reshow
  // the prompt. Disable the button in that state. "error" stays clickable
  // (timeout/unavailable are transient; user can retry).
  const disabled = state === "pending" || state === "denied";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-busy={state === "pending"}
      className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {LABELS[state]}
    </button>
  );
}
