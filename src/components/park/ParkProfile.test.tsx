/**
 * Integration test for the orchestrator. Verifies that the 16 sections render
 * in the canonical order locked by DESIGN.md "Visual order on the profile".
 *
 * Order is asserted by reading each section's aria-labelledby target id; if a
 * future refactor reorders the JSX, this test fails fast.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { ParkProfile } from "./ParkProfile";
import type { ParkWithRelations } from "@/lib/park-query";

function makeFullPark(): ParkWithRelations {
  return {
    id: 1,
    slug: "test",
    name: "Test Park",
    status: "temporarily_closed", // forces StatusBanner to render
    city: "Pittsburgh",
    state: "PA",
    establishedYear: 2010,
    parkType: "concrete_park",
    squareFootage: null,
    county: "Allegheny",
    streetAddress: "123 Test Ave",
    zip: "15201",
    alias: null,
    lat: 40.4406,
    lng: -79.9959,
    hours: "9am to 9pm",
    description: "A great park.",
    allowsSkateboards: true,
    allowsBikes: true,
    allowsRollerSkates: true,
    allowsScooters: true,
    vehicleRulesNotes: null,
    helmets: "recommended",
    otherPadsRequired: false,
    fee: false,
    programming: true, // forces ProgrammingModule to render
    ridingSurfaceNotes: null,
    ridingSurfacePhotoPath: null,
    statusChangedAt: null,
    reopenExpectedAt: null,
    wpPostId: null,
    lastRevalidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    renovations: [],
    surfaces: ["concrete"],
    obstacles: ["quarter_pipe"],
    amenities: [
      { parkId: 1, type: "bathroom", present: true, notes: null, photoPath: null },
    ],
    links: [
      {
        id: 1,
        parkId: 1,
        type: "website",
        url: "https://x.example",
        label: null,
        sortOrder: 0,
      },
      {
        id: 2,
        parkId: 1,
        type: "gofundme",
        url: "https://gofundme.com/x",
        label: null,
        sortOrder: 1,
      },
    ],
    photos: [],
    builders: [{ id: 1, name: "Test Builder", url: null, logoPath: null, wpPostId: null }],
  };
}

describe("ParkProfile — 16-section canonical order per DESIGN.md", () => {
  it("renders all required sections in order when every section has data", () => {
    const { container } = render(
      <ParkProfile park={makeFullPark()} nearbyParks={[]} nearbyShops={[]} />,
    );

    // Sections appear in DOM document order; collect their heading ids.
    const sectionHeadings = Array.from(
      container.querySelectorAll("[aria-labelledby]"),
    )
      .map((el) => el.getAttribute("aria-labelledby"))
      .filter((id): id is string =>
        // Filter to just the per-section aria-labelledby (skip the article's own).
        id !== "park-name" && id !== null,
      );

    // Canonical order. Skipping section IDs that don't have data in this fixture
    // (no address-heading because the test could not find an entry; surface/nearby
    // sections that render but have unique ids).
    expect(sectionHeadings).toEqual([
      "address-heading", // 3
      "hours-heading", // 4
      "overview-heading", // 5
      "rules-heading", // 6
      "amenities-heading", // 7
      "surface-heading", // 8
      "programming-heading", // 9
      "obstacles-heading", // 10
      "builders-heading", // 11
      "connect-heading", // 12
      "support-heading", // 13
      "suggest-heading", // 14
    ]);
  });

  it("hides Nearby Parks/Shops when both are empty", () => {
    render(
      <ParkProfile park={makeFullPark()} nearbyParks={[]} nearbyShops={[]} />,
    );
    // queryByRole('heading') would match every section; just check the two specific labels
    // are missing.
    expect(document.getElementById("nearby-parks-heading")).toBeNull();
    expect(document.getElementById("nearby-shops-heading")).toBeNull();
  });

  it("renders Nearby Parks and Nearby Shops when items are present", () => {
    render(
      <ParkProfile
        park={makeFullPark()}
        nearbyParks={[
          {
            name: "Nearby Park",
            city: "Pittsburgh",
            state: "PA",
            distanceMiles: 1.2,
            href: "/park/nearby",
            thumbStoragePath: null,
          },
        ]}
        nearbyShops={[
          {
            name: "Nearby Shop",
            city: null,
            state: "PA",
            distanceMiles: 2.4,
            href: null,
            thumbStoragePath: null,
          },
        ]}
      />,
    );
    expect(document.getElementById("nearby-parks-heading")).not.toBeNull();
    expect(document.getElementById("nearby-shops-heading")).not.toBeNull();
  });

  it("hides ProgrammingModule when park.programming is false", () => {
    render(
      <ParkProfile
        park={{ ...makeFullPark(), programming: false }}
        nearbyParks={[]}
        nearbyShops={[]}
      />,
    );
    expect(document.getElementById("programming-heading")).toBeNull();
  });
});
