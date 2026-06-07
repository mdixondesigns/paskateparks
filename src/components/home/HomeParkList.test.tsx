import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { HomeParkList } from "./HomeParkList";
import type { HomeParkRow } from "@/lib/park-query";

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

// Phase 6 D1+D2+D3+D5+CMT-2 — homepage client island.
//
// Tests cover the state-machine cells:
//   - default render (alpha, no geo, no filter)
//   - filter narrows
//   - geo grants → re-sort by distance + priority on first 3
//   - filter + geo compose (CMT-2)
//   - empty filter state
//   - aria-live announces

// happy-dom doesn't implement scrollIntoView — spyOn so restoreAllMocks()
// cleans up between tests (plain prototype assignment would leak across files).
beforeEach(() => {
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PARKS: HomeParkRow[] = [
  // alpha order: 9th, Bayne, FDR, Granahan, Pittsburgh, Wallenpaupack, Zembo
  { id: 1, slug: "9th-and-poplar", name: "9th and Poplar", city: "Philadelphia", state: "PA", lat: 39.96, lng: -75.15, heroPhotoPath: "parks/9th/photo-01" },
  { id: 2, slug: "bayne-skatepark", name: "Bayne Skatepark", city: "Bellevue", state: "PA", lat: 40.5, lng: -80.05, heroPhotoPath: "parks/bayne/photo-01" },
  { id: 3, slug: "fdr", name: "FDR Skatepark", city: "Philadelphia", state: "PA", lat: 39.91, lng: -75.18, heroPhotoPath: "parks/fdr/photo-01" },
  { id: 4, slug: "granahan", name: "Granahan", city: "Philadelphia", state: "PA", lat: 39.97, lng: -75.21, heroPhotoPath: null },
  { id: 5, slug: "wallenpaupack-skatepark", name: "Wallenpaupack Skatepark", city: "Hawley", state: "PA", lat: 41.47, lng: -75.18, heroPhotoPath: null },
];

function installGeolocation(coords: { latitude: number; longitude: number } | "deny") {
  const getCurrentPosition = vi.fn((success: SuccessCb, fail?: ErrorCb) => {
    if (coords === "deny") {
      fail?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    } else {
      success({
        coords: {
          ...coords,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        } as GeolocationCoordinates,
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    }
  });
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    geolocation: { getCurrentPosition },
  });
}

describe("HomeParkList", () => {
  describe("default render (no geo, no filter)", () => {
    it("renders all parks in the order they came in (alpha from the server)", () => {
      render(<HomeParkList parks={PARKS} />);
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(5);
      // Server-supplied order is preserved
      expect(items[0]?.textContent).toContain("9th and Poplar");
      expect(items[4]?.textContent).toContain("Wallenpaupack");
    });

    it("does not show distance pills in default state", () => {
      render(<HomeParkList parks={PARKS} />);
      expect(screen.queryByText(/\d+\.\d+ mi$/)).not.toBeInTheDocument();
    });

    it("renders the filter input + a 'Find parks near me' button", () => {
      installGeolocation({ latitude: 0, longitude: 0 });
      render(<HomeParkList parks={PARKS} />);
      expect(screen.getByPlaceholderText(/filter by name or city/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /find parks near me/i })).toBeInTheDocument();
    });
  });

  describe("filter input", () => {
    it("narrows the list to parks whose name matches", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "FDR" },
      });
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(1);
      expect(items[0]?.textContent).toContain("FDR Skatepark");
    });

    it("matches against city (case-insensitive)", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "philadelphia" },
      });
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(3); // 9th, FDR, Granahan
    });

    it("shows an empty state when the filter matches zero parks", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "xyzzy" },
      });
      expect(screen.getByText(/no parks match/i)).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });

  describe("geo grant", () => {
    it("re-sorts the list by distance from the user's location", async () => {
      // User at Philadelphia City Hall ~ (39.9526, -75.1652). Expected
      // nearest-first ordering of the Philly cluster:
      //   9th and Poplar  (39.96,  -75.15)   ~0.6 mi
      //   Granahan        (39.97,  -75.21)   ~2.5 mi
      //   FDR             (39.91,  -75.18)   ~3.0 mi
      //   Wallenpaupack   (41.47,  -75.18)   ~105 mi
      //   Bayne (Bellevue)(40.50,  -80.05)   ~262 mi
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        // Wait for the sort to settle.
        expect(screen.getAllByText(/\d+\.\d+ mi/).length).toBeGreaterThan(0);
      });
      const items = screen.getAllByRole("listitem");
      expect(items[0]?.textContent).toContain("9th and Poplar");
      expect(items[1]?.textContent).toContain("Granahan");
      expect(items[2]?.textContent).toContain("FDR Skatepark");
    });

    it("shows distance pills on each card after geo grants", async () => {
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        // Distance pill format is "0.6 mi", "262.4 mi", etc.
        expect(screen.getAllByText(/\d+\.\d+ mi/).length).toBeGreaterThanOrEqual(5);
      });
    });

    it('changes the heading from "All Pennsylvania skateparks" to "Nearest to you"', async () => {
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      expect(screen.getByRole("heading", { name: /all pennsylvania skateparks/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /nearest to you/i })).toBeInTheDocument();
      });
    });

    it("P1-A: scrolls the list into view after geo grants", async () => {
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      });
    });

    it("P1-A: writes a status announcement to the aria-live region", async () => {
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        const status = screen.getByRole("status");
        expect(status.textContent).toMatch(/nearest to you/i);
      });
    });
  });

  describe("CMT-2: filter + geo compose", () => {
    it("preserves the filter when geo grants — sort applies WITHIN the filtered set", async () => {
      installGeolocation({ latitude: 39.9526, longitude: -75.1652 });
      render(<HomeParkList parks={PARKS} />);
      // Filter to Philadelphia parks first
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "philadelphia" },
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
      // Then grant geo — filter should still be in effect (CMT-2: sort applies
      // WITHIN the filtered set). Nearest Philly park to City Hall: 9th and Poplar.
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(3);
        expect(items[0]?.textContent).toContain("9th and Poplar");
      });
      // Filter input still has its value
      expect(screen.getByPlaceholderText(/filter by name or city/i)).toHaveValue("philadelphia");
    });
  });

  describe("geo error", () => {
    it("on denial: shows an inline alert, list stays in default order", async () => {
      installGeolocation("deny");
      render(<HomeParkList parks={PARKS} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      // Default order preserved
      const items = screen.getAllByRole("listitem");
      expect(items[0]?.textContent).toContain("9th and Poplar");
    });
  });

  describe("zero parks (defensive)", () => {
    it("renders gracefully", () => {
      render(<HomeParkList parks={[]} />);
      // No list — empty filter shows no parks message? Actually we only show
      // the "no parks match" copy when the filter narrows to 0. With 0 input
      // parks and empty filter, we should just render no list. That's fine —
      // the heading + filter input still render.
      expect(screen.getByRole("heading")).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });
});
