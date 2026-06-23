import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { HomeParkList } from "./HomeParkList";
import type { HomeParkRow } from "@/lib/park-query";

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

// Phase 10 — HomeParkList is a presentational client component driven by
// props from SyncedMapList: parks, userLocation, mapCenter, onLocation,
// onError. Tests cover sort precedence (userLocation > mapCenter > alpha)
// + filter composition + the geo-error inline alert.

// happy-dom doesn't implement scrollIntoView — spyOn so restoreAllMocks()
// cleans up between tests.
beforeEach(() => {
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PARKS: HomeParkRow[] = [
  // alpha order: 9th, Bayne, FDR, Granahan, Wallenpaupack
  { id: 1, slug: "9th-and-poplar", name: "9th and Poplar", alias: null, city: "Philadelphia", state: "PA", lat: 39.96, lng: -75.15, heroPhotoPath: "parks/9th/photo-01" },
  { id: 2, slug: "bayne-skatepark", name: "Bayne Skatepark", alias: "Bellevue Skate Plaza", city: "Bellevue", state: "PA", lat: 40.5, lng: -80.05, heroPhotoPath: "parks/bayne/photo-01" },
  { id: 3, slug: "fdr", name: "FDR Skatepark", alias: null, city: "Philadelphia", state: "PA", lat: 39.91, lng: -75.18, heroPhotoPath: "parks/fdr/photo-01" },
  { id: 4, slug: "granahan", name: "Granahan", alias: null, city: "Philadelphia", state: "PA", lat: 39.97, lng: -75.21, heroPhotoPath: null },
  { id: 5, slug: "wallenpaupack-skatepark", name: "Wallenpaupack Skatepark", alias: null, city: "Hawley", state: "PA", lat: 41.47, lng: -75.18, heroPhotoPath: null },
];

const PHILLY = { lat: 39.9526, lng: -75.1652 }; // City Hall

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
        timestamp: 1,
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
  describe("default render (no sort origin, no filter)", () => {
    it("renders parks in the input order (alphabetical from RSC)", () => {
      render(<HomeParkList parks={PARKS} />);
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(5);
      expect(items[0]?.textContent).toContain("9th and Poplar");
      expect(items[4]?.textContent).toContain("Wallenpaupack");
    });

    it("does not show distance pills", () => {
      render(<HomeParkList parks={PARKS} />);
      expect(screen.queryByText(/\d+\.\d+ mi$/)).not.toBeInTheDocument();
    });

    it("renders an empty role=status region", () => {
      render(<HomeParkList parks={PARKS} />);
      const status = screen.getByRole("status");
      expect(status.textContent ?? "").toBe("");
    });
  });

  describe("filter input", () => {
    it("narrows by name", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "FDR" },
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });

    it("matches city (case-insensitive)", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "philadelphia" },
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("matches alias (locals' nickname)", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "bellevue skate" },
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("Bayne Skatepark");
    });

    it("shows empty state when zero match", () => {
      render(<HomeParkList parks={PARKS} />);
      fireEvent.change(screen.getByPlaceholderText(/filter by name or city/i), {
        target: { value: "xyzzy" },
      });
      expect(screen.getByText(/no parks match/i)).toBeInTheDocument();
    });
  });

  describe("userLocation sort", () => {
    it("re-sorts the list by distance from the user", () => {
      render(<HomeParkList parks={PARKS} userLocation={PHILLY} />);
      const items = screen.getAllByRole("listitem");
      expect(items[0]?.textContent).toContain("9th and Poplar"); // ~0.6mi
      expect(items[1]?.textContent).toContain("Granahan"); // ~2.5mi
      expect(items[2]?.textContent).toContain("FDR Skatepark"); // ~3mi
    });

    it("shows distance pills", () => {
      render(<HomeParkList parks={PARKS} userLocation={PHILLY} />);
      expect(screen.getAllByText(/\d+\.\d+ mi/).length).toBeGreaterThanOrEqual(5);
    });

    it("changes the heading to 'Nearest to you'", () => {
      render(<HomeParkList parks={PARKS} userLocation={PHILLY} />);
      expect(screen.getByRole("heading", { name: /nearest to you/i })).toBeInTheDocument();
    });

    it("scrolls the list into view on transition from null → userLocation", () => {
      const { rerender } = render(<HomeParkList parks={PARKS} userLocation={null} />);
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      rerender(<HomeParkList parks={PARKS} userLocation={PHILLY} />);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("writes a status announcement to role=status", () => {
      render(<HomeParkList parks={PARKS} userLocation={PHILLY} />);
      expect(screen.getByRole("status").textContent).toMatch(/nearest to you/i);
    });
  });

  describe("mapCenter sort (Plan A — no bbox filter, just reorder)", () => {
    it("sorts by distance from map center when userLocation is null", () => {
      // Map centered on Pittsburgh — Bayne (Bellevue) should come first.
      render(
        <HomeParkList parks={PARKS} mapCenter={{ lat: 40.45, lng: -80.0 }} />,
      );
      const items = screen.getAllByRole("listitem");
      expect(items[0]?.textContent).toContain("Bayne Skatepark");
    });

    it("suppresses distance pills (pan would churn them — too noisy)", () => {
      render(
        <HomeParkList parks={PARKS} mapCenter={{ lat: 40.45, lng: -80.0 }} />,
      );
      expect(screen.queryByText(/\d+\.\d+ mi$/)).not.toBeInTheDocument();
    });

    it("does NOT change the heading (heading swap is reserved for explicit user-location grant)", () => {
      render(
        <HomeParkList parks={PARKS} mapCenter={{ lat: 40.45, lng: -80.0 }} />,
      );
      expect(
        screen.getByRole("heading", { name: /all pennsylvania skateparks/i }),
      ).toBeInTheDocument();
    });

    it("userLocation wins over mapCenter (user proximity is the stronger intent)", () => {
      // Map at Pittsburgh, user at Philly — sort by Philly (user wins).
      render(
        <HomeParkList
          parks={PARKS}
          userLocation={PHILLY}
          mapCenter={{ lat: 40.45, lng: -80.0 }}
        />,
      );
      const items = screen.getAllByRole("listitem");
      expect(items[0]?.textContent).toContain("9th and Poplar");
    });
  });

  describe("CMT-2: filter + sort compose", () => {
    it("filter narrows the set; userLocation sorts within it", () => {
      const { container } = render(
        <HomeParkList parks={PARKS} userLocation={PHILLY} />,
      );
      const filterInput = container.querySelector("input[type='search']") as HTMLInputElement;
      fireEvent.change(filterInput, { target: { value: "philadelphia" } });
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]?.textContent).toContain("9th and Poplar");
    });
  });

  describe("NearMe button → onLocation callback (wires up to SyncedMapList)", () => {
    it("forwards a successful geo fix to the onLocation prop", async () => {
      installGeolocation({ latitude: PHILLY.lat, longitude: PHILLY.lng });
      const onLocation = vi.fn();
      render(<HomeParkList parks={PARKS} onLocation={onLocation} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        expect(onLocation).toHaveBeenCalledWith(PHILLY.lat, PHILLY.lng);
      });
    });

    it("on denial: surfaces an inline alert AND calls onError", async () => {
      installGeolocation("deny");
      const onError = vi.fn();
      render(<HomeParkList parks={PARKS} onError={onError} />);
      fireEvent.click(screen.getByRole("button", { name: /find parks near me/i }));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(onError).toHaveBeenCalledWith("denied");
      });
    });
  });

  describe("zero parks (defensive)", () => {
    it("renders gracefully", () => {
      render(<HomeParkList parks={[]} />);
      expect(screen.getByRole("heading")).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });
});
