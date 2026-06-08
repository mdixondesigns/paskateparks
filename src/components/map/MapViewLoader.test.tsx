import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Phase 7 — MapViewLoader is the thin client-component bridge that hosts the
// `next/dynamic(MapView, ssr: false)` call (Next 16 forbids ssr:false in
// Server Components, so the dynamic import can't live in /map/page.tsx).
//
// This test locks two contracts:
//   1. The loader passes `ssr: false` to next/dynamic — a regression to
//      `ssr: true` would break the production build because Leaflet imports
//      `window` at module top level.
//   2. The loading prop renders null (ship-review F4). The visible-by-default
//      fallback park list in /map/page.tsx IS the loading affordance; a
//      separate h-screen skeleton would stack below the list and push page
//      height to ~2x viewport on slow 4G.

// Hoisted so the vi.mock factory below (itself hoisted above the static
// `import MapViewLoader` at the bottom of this file) can close over it.
const { dynamicSpy } = vi.hoisted(() => ({ dynamicSpy: vi.fn() }));

vi.mock("next/dynamic", () => ({
  default: (loader: unknown, opts: { ssr?: boolean; loading?: () => React.ReactNode }) => {
    dynamicSpy(loader, opts);
    // Return the loading component so render() shows the skeleton, not the
    // real (mocked-out) MapView.
    return opts.loading ?? (() => null);
  },
}));

import { MapViewLoader } from "./MapViewLoader";

describe("MapViewLoader — next/dynamic shim", () => {
  it("calls next/dynamic with { ssr: false }", () => {
    render(<MapViewLoader parks={[]} />);
    expect(dynamicSpy).toHaveBeenCalledTimes(1);
    const opts = dynamicSpy.mock.calls[0]?.[1] as { ssr?: boolean };
    expect(opts.ssr).toBe(false);
  });

  it("F4: loading prop returns null (no separate skeleton — fallback list IS the loading affordance)", () => {
    render(<MapViewLoader parks={[]} />);
    const opts = dynamicSpy.mock.calls[0]?.[1] as { loading?: () => unknown };
    expect(opts.loading).toBeDefined();
    expect(opts.loading?.()).toBeNull();
    // And: nothing user-visible during the loading window — no "Loading…" copy.
    expect(screen.queryByText(/loading/i)).toBeNull();
  });
});
