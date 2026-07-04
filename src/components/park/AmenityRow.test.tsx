import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AmenityRow } from "./AmenityRow";
import type { ParkWithRelations } from "@/lib/park-query";

type Amenity = ParkWithRelations["amenities"][number];

function amenity(partial: Partial<Amenity>): Amenity {
  return {
    parkId: 1,
    type: "bathroom",
    present: false,
    notes: null,
    photoPath: null,
    ...partial,
  };
}

describe("AmenityRow — D18 universal Y/N + Notes + Photo", () => {
  it("renders the present state with an Available status icon", () => {
    render(<AmenityRow amenity={amenity({ type: "parking", present: true })} />);
    expect(screen.getByText(/Parking/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parking: Available/i)).toBeInTheDocument();
  });

  it("renders the absent state with a Not available status icon", () => {
    render(<AmenityRow amenity={amenity({ type: "lights", present: false })} />);
    expect(screen.getByLabelText(/Lights: Not available/i)).toBeInTheDocument();
  });

  it("renders as a plain row (no <details>) when there are no notes and no photo", () => {
    const { container } = render(
      <AmenityRow amenity={amenity({ type: "lights", present: false })} />,
    );
    expect(container.querySelector("details")).not.toBeInTheDocument();
  });

  it("renders as a <details> accordion, collapsed by default, when notes are present", () => {
    const { container } = render(
      <AmenityRow
        amenity={amenity({
          type: "onsite_shop",
          present: false,
          notes: "No onsite shop, but Plank Eye is 0.3mi away.",
        })}
      />,
    );
    const details = container.querySelector("details");
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
    // Notes are in the DOM even collapsed — <details> hides content via the
    // browser's native collapse, not by unmounting it.
    expect(screen.getByText(/No onsite shop, but Plank Eye is 0.3mi away/i)).toBeInTheDocument();
  });

  it("does not render a notes paragraph when notes is null", () => {
    render(<AmenityRow amenity={amenity({ type: "drinking_water", present: false })} />);
    expect(screen.queryByText(/italic/i)).not.toBeInTheDocument();
  });
});
