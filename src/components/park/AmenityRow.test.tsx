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
  it("renders the present state with ✓", () => {
    render(<AmenityRow amenity={amenity({ type: "parking", present: true })} />);
    expect(screen.getByText(/Parking/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parking: Available/i)).toHaveTextContent("✓ Yes");
  });

  it("renders the absent state with — (em dash)", () => {
    render(<AmenityRow amenity={amenity({ type: "lights", present: false })} />);
    expect(screen.getByLabelText(/Lights: Not available/i)).toHaveTextContent("—");
  });

  it("shows notes when present (even on a not-available amenity — edge case from TEST-PLAN.md)", () => {
    render(
      <AmenityRow
        amenity={amenity({
          type: "onsite_shop",
          present: false,
          notes: "No onsite shop, but Plank Eye is 0.3mi away.",
        })}
      />,
    );
    expect(
      screen.getByText(/No onsite shop, but Plank Eye is 0.3mi away/i),
    ).toBeInTheDocument();
  });

  it("hides the notes block when notes is null", () => {
    render(<AmenityRow amenity={amenity({ type: "drinking_water", present: false })} />);
    expect(screen.queryByText(/italic/i)).not.toBeInTheDocument();
  });
});
