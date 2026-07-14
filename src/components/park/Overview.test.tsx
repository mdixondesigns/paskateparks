/**
 * Regression suite for the description-render bug fixed 2026-06-15.
 *
 * Before the fix, `park.description` was rendered as a JSX text child, which
 * string-escaped the HTML and showed literal `<p>` and `</p>` tags on every
 * park profile page. The fix uses dangerouslySetInnerHTML so the HTML parses
 * into real DOM elements.
 *
 * Asserting "the rendered output contains a `<p>` element" (rather than
 * "doesn't contain literal `<p>` text") is the load-bearing check — any
 * future refactor that re-introduces the bug fails this test loudly.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Overview } from "./Overview";
import type { ParkWithRelations } from "@/lib/park-query";

function parkWith(overrides: Partial<ParkWithRelations>): ParkWithRelations {
  return {
    id: 1,
    slug: "test",
    name: "Test Park",
    status: "open",
    city: "Pittsburgh",
    state: "PA",
    establishedYear: null,
    parkType: null,
    squareFootage: null,
    county: "Allegheny",
    streetAddress: null,
    zip: null,
    lat: null,
    lng: null,
    description: null,
    hours: null,
    fee: false,
    helmets: "none_posted",
    otherPadsRequired: false,
    allowsSkateboards: true,
    allowsBikes: false,
    allowsScooters: false,
    allowsRollerSkates: false,
    vehicleRulesNotes: null,
    programming: false,
    statusChangedAt: null,
    reopenExpectedAt: null,
    ridingSurfaceNotes: null,
    heroPhotoPath: null,
    ridingSurfacePhotoPath: null,
    photos: [],
    amenities: [],
    ridingSurfaces: [],
    obstacles: [],
    builders: [],
    renovations: [],
    links: [],
    ...overrides,
  } as ParkWithRelations;
}

describe("Overview — description renders as parsed HTML, not literal text", () => {
  it("renders <p> tags as actual DOM elements", () => {
    const park = parkWith({
      description: "<p>First paragraph.</p>\n\n<p>Second paragraph.</p>",
    });
    const { container } = render(<Overview park={park} />);

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]?.textContent).toBe("First paragraph.");
    expect(paragraphs[1]?.textContent).toBe("Second paragraph.");
  });

  it("does NOT render literal angle-bracket text from the HTML", () => {
    const park = parkWith({
      description: "<p>Real content.</p>",
    });
    const { container } = render(<Overview park={park} />);
    // The pre-fix bug rendered the string verbatim — `<p>Real content.</p>` as
    // a single text node. Catching the literal substring guards against
    // regression even if a future change uses a different render path.
    expect(container.textContent).not.toContain("<p>");
    expect(container.textContent).not.toContain("</p>");
    expect(container.textContent).toContain("Real content.");
  });

  it("hides the entire section when description and photos are both empty", () => {
    const park = parkWith({ description: null, photos: [] });
    const { container } = render(<Overview park={park} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Overview heading + description when description is present and photos absent", () => {
    const park = parkWith({
      description: "<p>FDR is the mecca.</p>",
      photos: [],
    });
    render(<Overview park={park} />);
    expect(screen.getByRole("heading", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByText("FDR is the mecca.")).toBeInTheDocument();
  });

  it("preserves inline HTML (anchors, emphasis) inside description paragraphs", () => {
    const park = parkWith({
      description: '<p>Visit <a href="https://example.com">our site</a>.</p>',
    });
    const { container } = render(<Overview park={park} />);
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.textContent).toBe("our site");
  });
});
