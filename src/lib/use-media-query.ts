"use client";

import { useCallback, useSyncExternalStore } from "react";

// Subscribes to a CSS media query. `serverDefault` is used for SSR and the
// hydration render; React re-renders with the real value right after if it
// differs, so there is no hydration mismatch.
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverDefault, [serverDefault]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
