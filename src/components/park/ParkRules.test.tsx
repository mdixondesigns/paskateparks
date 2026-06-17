import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ParkRules } from "./ParkRules";
import type { ParkWithRelations } from "@/lib/park-query";

// Minimal park stub for testing. Only the fields ParkRules reads are real;
// the rest are placeholders that satisfy the type.
function makePark(overrides: Partial<ParkWithRelations>): ParkWithRelations {
  return {
    id: 1,
    slug: "test",
    name: "Test Park",
    status: "open",
    city: "City",
    state: "PA",
    establishedYear: null,
    parkType: null,
    squareFootage: null,
    county: null,
    streetAddress: null,
    zip: null,
    alias: null,
    lat: null,
    lng: null,
    hours: null,
    description: null,
    allowsSkateboards: true,
    allowsBikes: true,
    allowsRollerSkates: true,
    allowsScooters: true,
    vehicleRulesNotes: null,
    helmets: "none_posted",
    otherPadsRequired: false,
    fee: false,
    programming: false,
    ridingSurfaceNotes: null,
    ridingSurfacePhotoPath: null,
    statusChangedAt: null,
    reopenExpectedAt: null,
    wpPostId: null,
    lastRevalidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    renovations: [],
    surfaces: [],
    obstacles: [],
    amenities: [],
    links: [],
    photos: [],
    builders: [],
    ...overrides,
  };
}

describe("ParkRules — D15/D16/D17 rendering", () => {
  it("marks all four vehicles allowed by default", () => {
    render(<ParkRules park={makePark({})} />);
    expect(screen.getByLabelText(/Skateboards allowed/i)).toHaveAttribute(
      "data-allowed",
      "true",
    );
    expect(screen.getByLabelText(/Bikes allowed/i)).toHaveAttribute(
      "data-allowed",
      "true",
    );
    expect(screen.getByLabelText(/Roller skates allowed/i)).toHaveAttribute(
      "data-allowed",
      "true",
    );
    expect(screen.getByLabelText(/Scooters allowed/i)).toHaveAttribute(
      "data-allowed",
      "true",
    );
  });

  it("renders a disallowed vehicle with three accessibility signals (label + data attr + line-through class)", () => {
    render(<ParkRules park={makePark({ allowsBikes: false })} />);
    const bikes = screen.getByLabelText(/Bikes not allowed/i);
    expect(bikes).toHaveAttribute("data-allowed", "false");
    expect(bikes.className).toMatch(/line-through/);
    // A6 — "color is never the only signal" rule. The ✕ glyph is the third.
    expect(bikes).toHaveTextContent(/✕/);
  });

  it("renders the vehicle rules notes paragraph when present", () => {
    render(
      <ParkRules
        park={makePark({
          allowsBikes: false,
          vehicleRulesNotes: "Bikes are prohibited at the request of the neighbors.",
        })}
      />,
    );
    expect(
      screen.getByText(/Bikes are prohibited at the request of the neighbors/i),
    ).toBeInTheDocument();
  });

  it("renders Helmets / Other pads / Fee with correct labels", () => {
    render(
      <ParkRules
        park={makePark({
          helmets: "required_under_12",
          otherPadsRequired: true,
          fee: true,
        })}
      />,
    );
    expect(screen.getByText(/Required for skaters under 12/i)).toBeInTheDocument();
    expect(screen.getByText(/^Required$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Yes$/i)).toBeInTheDocument();
  });

  it("renders 'Free' for fee=false", () => {
    render(<ParkRules park={makePark({ fee: false })} />);
    expect(screen.getByText(/^Free$/i)).toBeInTheDocument();
  });
});
