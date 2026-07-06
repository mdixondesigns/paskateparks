import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { MapMoveEnd, MapViewProps } from "@/components/map/MapView";
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

// MapView is dynamically imported with ssr: false — replace with a stub that
// captures the last props it was rendered with, so tests can invoke
// onMoveEnd/etc. directly without loading real Leaflet under happy-dom.
let lastMapViewProps: MapViewProps | null = null;
vi.mock("@/components/map/MapView", () => ({
  MapView: (props: MapViewProps) => {
    lastMapViewProps = props;
    return null;
  },
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

// Bounds covering ONLY FDR (39.91, -75.18) — excludes 9th (39.96, just north
// of the boundary) and Bayne (40.5, near Pittsburgh).
const PHILLY_ONLY_FDR: MapMoveEnd["bounds"] = { south: 39.85, west: -75.25, north: 39.95, east: -75.1 };
// A second, slightly different bounds that STILL contains only FDR — used to
// test that a pan which doesn't change the visible-ID set does not trigger
// the .list-refreshing transition (Finding 2A).
const PHILLY_ONLY_FDR_SHIFTED: MapMoveEnd["bounds"] = { south: 39.8, west: -75.28, north: 39.93, east: -75.05 };
// Bounds covering both Philadelphia parks (9th + FDR) but not Bayne.
const PHILLY_BOTH: MapMoveEnd["bounds"] = { south: 39.8, west: -75.3, north: 40.0, east: -75.0 };
// Bounds nowhere near PA — yields zero results.
const EMPTY_BOUNDS: MapMoveEnd["bounds"] = { south: 10, west: 10, north: 11, east: 11 };

function fireMoveEnd(bounds: MapMoveEnd["bounds"], overrides: Partial<MapMoveEnd> = {}) {
  act(() => {
    lastMapViewProps?.onMoveEnd?.({ lat: 0, lng: 0, zoom: 10, bounds, ...overrides });
  });
}

describe("SyncedMapList — automatic bbox filter (restored 2026-07-06)", () => {
  beforeEach(() => {
    pathnameValue = "/";
  });

  it("narrows the list to exactly the parks whose coordinates fall within the map bounds", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    fireMoveEnd(PHILLY_ONLY_FDR);

    expect(screen.getByText("FDR Skatepark")).toBeInTheDocument();
    expect(screen.queryByText("9th and Poplar")).not.toBeInTheDocument();
    expect(screen.queryByText("Bayne Skatepark")).not.toBeInTheDocument();
  });

  it("shows the bbox-empty override (not HomeParkList's DB-empty branch) when panned somewhere with zero parks", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    fireMoveEnd(EMPTY_BOUNDS);

    expect(screen.getByText(/no skateparks in this area/i)).toBeInTheDocument();
    expect(screen.queryByText(/no parks available right now/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see all parks/i })).toBeInTheDocument();
  });

  it("D7: a park with no coordinates never appears, regardless of bounds", async () => {
    const withStub: HomeParkRow[] = [
      ...PARKS,
      {
        id: 99,
        slug: "wherehouse54",
        name: "Wherehouse54",
        alias: null,
        city: "Lancaster",
        state: "PA",
        lat: null,
        lng: null,
        heroPhotoPath: null,
      },
    ];
    render(<SyncedMapList parks={withStub} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    // Unfiltered (mapBounds still null) — stub already absent.
    expect(screen.queryByText("Wherehouse54")).not.toBeInTheDocument();

    // Panning to a huge bounds covering the whole state still excludes it.
    fireMoveEnd({ south: 39.0, west: -81.0, north: 43.0, east: -74.0 });
    expect(screen.queryByText("Wherehouse54")).not.toBeInTheDocument();
  });

  it("D5: typed search text survives panning into an empty area and back", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    const input = screen.getByPlaceholderText(/filter by name or city/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "FDR" } });
    expect(input.value).toBe("FDR");

    fireMoveEnd(EMPTY_BOUNDS);
    expect(screen.getByText(/no skateparks in this area/i)).toBeInTheDocument();
    // HomeParkList never unmounted — the input (and its typed value) is the
    // same DOM node the whole time.
    expect(screen.getByPlaceholderText(/filter by name or city/i)).toHaveValue("FDR");

    fireMoveEnd(PHILLY_BOTH);
    expect(screen.getByPlaceholderText(/filter by name or city/i)).toHaveValue("FDR");
  });

  it("CRITICAL regression: a search matching 0 parks in the current bbox but >0 elsewhere shows the text-filter-empty message, not the bbox-empty override", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    // Narrow to only FDR being in view...
    fireMoveEnd(PHILLY_ONLY_FDR);
    // ...then search for a park that exists but isn't in the current bbox.
    fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
      target: { value: "Bayne" },
    });

    expect(screen.getByText(/no parks match/i)).toBeInTheDocument();
    expect(screen.queryByText(/no skateparks in this area/i)).not.toBeInTheDocument();
  });

  it("'See all parks' chip is absent on initial unfiltered render", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /see all parks/i })).not.toBeInTheDocument();
  });

  it("'See all parks' chip appears when filtered, resets the view end-to-end, and moves focus to the list heading", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    fireMoveEnd(PHILLY_ONLY_FDR);
    const chip = screen.getByRole("button", { name: /see all parks/i });
    expect(chip).toBeInTheDocument();
    expect(screen.queryByText("Bayne Skatepark")).not.toBeInTheDocument();

    act(() => {
      chip.click();
    });

    expect(lastMapViewProps?.fitAllRequestId).toBe(1);
    expect(document.activeElement?.id).toBe("park-list-heading");

    // End-to-end: simulate the moveend a real MapView emits once its
    // fitAllRequestId effect actually re-fits to all parks (a bounds
    // covering every PARKS fixture, including Bayne near Pittsburgh).
    // Without this, a regression that broke the reset loop (MapView never
    // re-firing fitBounds) would only be caught by the slower e2e suite.
    const ALL_PARKS_BOUNDS: MapMoveEnd["bounds"] = { south: 39.0, west: -81.0, north: 41.0, east: -74.0 };
    fireMoveEnd(ALL_PARKS_BOUNDS);

    expect(screen.getByText("Bayne Skatepark")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /see all parks/i })).not.toBeInTheDocument();
  });

  it("selected park scrolling out of the current bbox does not crash and clears the highlight", async () => {
    render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    act(() => {
      lastMapViewProps?.onPopupOpen?.(3); // FDR
    });
    await waitFor(() => {
      expect(document.querySelector(".card-selected")?.getAttribute("data-park-id")).toBe("3");
    });

    // Pan so FDR is no longer in view — should not throw, and the now-absent
    // card's highlight simply disappears with it.
    expect(() => fireMoveEnd(EMPTY_BOUNDS)).not.toThrow();
    expect(document.querySelectorAll(".card-selected")).toHaveLength(0);
  });
});

describe("SyncedMapList — .list-refreshing transition (Finding 2A)", () => {
  beforeEach(() => {
    pathnameValue = "/";
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function listContainer(container: HTMLElement): HTMLElement {
    // The outer div rendered by SyncedMapList that wraps HomeParkList +
    // HomeFooter — the one .list-refreshing is toggled on.
    return container.querySelector(".lg\\:max-h-full") as HTMLElement;
  }

  it("does NOT toggle on the very first render (mount doesn't flash)", async () => {
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());
    expect(listContainer(container).className).not.toContain("list-refreshing");
  });

  it("toggles .list-refreshing when the visible-park-ID set actually changes", async () => {
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    // PHILLY_BOTH (9th + FDR) -> PHILLY_ONLY_FDR (just FDR) changes the set.
    fireMoveEnd(PHILLY_BOTH);
    fireMoveEnd(PHILLY_ONLY_FDR);

    expect(listContainer(container).className).toContain("list-refreshing");
  });

  it("does NOT toggle .list-refreshing when a pan leaves the visible-ID set unchanged", async () => {
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    // Settle on a known set first (just FDR) — this pan DOES change the set
    // from the initial mount (all 3 parks), so let its transition clear.
    fireMoveEnd(PHILLY_ONLY_FDR);
    expect(listContainer(container).className).toContain("list-refreshing");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(listContainer(container).className).not.toContain("list-refreshing");

    // Now pan to a DIFFERENT bounds that still contains only FDR — same
    // visible-ID set, different bounds object. This is exactly the "panning
    // within a dense area" case Finding 2A exists to handle correctly.
    fireMoveEnd(PHILLY_ONLY_FDR_SHIFTED);

    expect(listContainer(container).className).not.toContain("list-refreshing");
  });

  it("clears .list-refreshing after the 200ms timeout", async () => {
    const { container } = render(<SyncedMapList parks={PARKS} />);
    await waitFor(() => expect(screen.getByText("FDR Skatepark")).toBeInTheDocument());

    fireMoveEnd(PHILLY_BOTH);
    fireMoveEnd(PHILLY_ONLY_FDR);
    expect(listContainer(container).className).toContain("list-refreshing");

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(listContainer(container).className).not.toContain("list-refreshing");
  });
});
