import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { HomeParkRow } from "@/lib/park-query";

// Park-modal phase — SyncedMapList now derives a `selectedId` from
// usePathname()'s match against /park/<slug>, with precedence
// `modalParkId ?? popupOpenForId`. This test file covers JUST the new
// pathname-driven highlight behavior; the rest of SyncedMapList (hover sync,
// marker click scroll, mapCenter sort, mobile map pill) is exercised
// end-to-end in e2e/synced-layout.spec.ts.

// happy-dom doesn't implement matchMedia — install a no-op shim so the
// effect that listens for (min-width: 1024px) / (hover: hover) doesn't throw.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: true, // desktop + hover-capable
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// usePathname is the load-bearing input — control it per test.
let pathnameValue = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameValue,
}));

// MapView is dynamically imported with ssr: false — replace with a null stub
// so the test doesn't try to load Leaflet under happy-dom.
vi.mock("@/components/map/MapView", () => ({
  MapView: () => null,
}));

// useMapUrlState reads/writes URL viewport state — stub to a fixed value.
vi.mock("@/lib/use-map-url-state", () => ({
  useMapUrlState: () => ({
    initialView: null,
    writeViewport: vi.fn(),
    setUserDriven: vi.fn(),
  }),
}));

import { SyncedMapList } from "./SyncedMapList";

const PARKS: HomeParkRow[] = [
  { id: 1, slug: "9th-and-poplar", name: "9th and Poplar", alias: null, city: "Philadelphia", state: "PA", lat: 39.96, lng: -75.15, heroPhotoPath: "parks/9th/photo-01" },
  { id: 2, slug: "bayne-skatepark", name: "Bayne Skatepark", alias: null, city: "Bellevue", state: "PA", lat: 40.5, lng: -80.05, heroPhotoPath: "parks/bayne/photo-01" },
  { id: 3, slug: "fdr", name: "FDR Skatepark", alias: null, city: "Philadelphia", state: "PA", lat: 39.91, lng: -75.18, heroPhotoPath: "parks/fdr/photo-01" },
];

describe("SyncedMapList — pathname-driven .card-selected (park-modal phase)", () => {
  it("does not highlight any card when pathname is /", async () => {
    pathnameValue = "/";
    const { container } = render(<SyncedMapList parks={PARKS} />);
    // Allow any post-mount effects to run.
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    expect(container.querySelectorAll(".card-selected")).toHaveLength(0);
  });

  it("adds .card-selected to the matching card when pathname is /park/<slug>", async () => {
    pathnameValue = "/park/fdr";
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => {
      const selected = container.querySelector<HTMLElement>(".card-selected");
      expect(selected).not.toBeNull();
      expect(selected?.getAttribute("data-park-id")).toBe("3");
    });
  });

  it("URL-encoded slug in pathname still matches (decodes before lookup)", async () => {
    pathnameValue = "/park/9th-and-poplar";
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => {
      const selected = container.querySelector<HTMLElement>(".card-selected");
      expect(selected?.getAttribute("data-park-id")).toBe("1");
    });
  });

  it("pathname matching an unknown slug yields no highlight (defensive)", async () => {
    pathnameValue = "/park/does-not-exist";
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    expect(container.querySelectorAll(".card-selected")).toHaveLength(0);
  });

  it("non-/park pathname (e.g., /county/...) yields no highlight", async () => {
    pathnameValue = "/county/philadelphia";
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    expect(container.querySelectorAll(".card-selected")).toHaveLength(0);
  });
});
