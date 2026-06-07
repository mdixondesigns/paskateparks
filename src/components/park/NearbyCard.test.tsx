import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NearbyCard } from "./NearbyCard";

// Phase 6 widened NearbyCard:
//   • distanceMiles became optional (homepage no-geo state)
//   • priority?: boolean was added (LCP-critical thumbs above the fold)
// These tests guard the existing park-profile callers (NearbyParks, NearbyShops)
// against regression while documenting the new optional shape.

describe("NearbyCard", () => {
  it("renders distance pill when distanceMiles is provided (existing park-profile case)", () => {
    render(
      <ul>
        <NearbyCard
          item={{
            name: "FDR Skatepark",
            city: "Philadelphia",
            state: "PA",
            distanceMiles: 0.3,
            href: "/park/fdr",
          }}
        />
      </ul>,
    );
    expect(screen.getByText("FDR Skatepark")).toBeInTheDocument();
    expect(screen.getByText("Philadelphia, PA")).toBeInTheDocument();
    expect(screen.getByText("0.3 mi")).toBeInTheDocument();
    // ARIA label for screen readers
    expect(screen.getByLabelText("0.3 miles away")).toBeInTheDocument();
  });

  it("rounds the distance to one decimal (matches WP audit '0.1 miles away' pattern)", () => {
    render(
      <ul>
        <NearbyCard item={{ name: "Test", distanceMiles: 12.456 }} />
      </ul>,
    );
    expect(screen.getByText("12.5 mi")).toBeInTheDocument();
  });

  it("omits the distance pill when distanceMiles is undefined (homepage no-geo state)", () => {
    render(
      <ul>
        <NearbyCard
          item={{
            name: "Bayne Skatepark",
            city: "Bellevue",
            state: "PA",
            href: "/park/bayne-skatepark",
          }}
        />
      </ul>,
    );
    expect(screen.getByText("Bayne Skatepark")).toBeInTheDocument();
    expect(screen.queryByText(/mi$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/miles away/)).not.toBeInTheDocument();
  });

  it("renders zero distance correctly (don't truthy-check distanceMiles)", () => {
    // Edge case: user is standing inside the park. 0 is a valid distance.
    render(
      <ul>
        <NearbyCard item={{ name: "Right here", distanceMiles: 0 }} />
      </ul>,
    );
    expect(screen.getByText("0.0 mi")).toBeInTheDocument();
  });

  it("wraps the row in an <a> when href is provided", () => {
    render(
      <ul>
        <NearbyCard item={{ name: "FDR", href: "/park/fdr", distanceMiles: 1 }} />
      </ul>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/park/fdr");
  });

  it("renders as a plain <div> when href is null (e.g. shop without a website)", () => {
    render(
      <ul>
        <NearbyCard item={{ name: "Local Shop", href: null, distanceMiles: 2 }} />
      </ul>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Local Shop")).toBeInTheDocument();
  });

  it("renders a thumbnail-shaped placeholder when thumbStoragePath is absent", () => {
    const { container } = render(
      <ul>
        <NearbyCard item={{ name: "No photo park" }} />
      </ul>,
    );
    const placeholder = container.querySelector('div[aria-hidden="true"]');
    expect(placeholder).not.toBeNull();
  });

  it("threads priority=true into the ResponsiveImage as eager + fetchPriority high (D9 LCP)", () => {
    const { container } = render(
      <ul>
        <NearbyCard
          item={{
            name: "Above the fold",
            thumbStoragePath: "parks/fdr/photo-01",
            priority: true,
          }}
        />
      </ul>,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(img?.getAttribute("fetchpriority")).toBe("high");
  });

  it("defaults priority=false to lazy loading (rest of the list)", () => {
    const { container } = render(
      <ul>
        <NearbyCard
          item={{ name: "Below the fold", thumbStoragePath: "parks/fdr/photo-01" }}
        />
      </ul>,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("fetchpriority")).toBeNull();
  });
});
