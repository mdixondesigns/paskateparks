import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Phase 7 /map/ RSC integration test. Mocks the data layer and the
// dynamic-imported MapView so the test focuses on the RSC's structure:
//   • SSR sr-only h1 present
//   • visible-by-default fallback park list — one <a> per park in the mock
//   • preconnect <link> emitted
//   • dynamic-imported <MapView /> mounted as a child

vi.mock("@/lib/park-query", () => ({
  getOpenParksForMap: vi.fn(async () => [
    { id: 1, slug: "fdr", name: "FDR Skatepark", city: "Philadelphia", state: "PA", lat: 39.91, lng: -75.18 },
    { id: 2, slug: "bayne", name: "Bayne Skatepark", city: "Bellevue", state: "PA", lat: 40.5, lng: -80.05 },
    { id: 3, slug: "9th-poplar", name: "9th and Poplar", city: "Philadelphia", state: "PA", lat: 39.97, lng: -75.16 },
  ]),
}));

// Mock the MapViewLoader (which internally does next/dynamic(MapView, ssr:false))
// to render a sentinel synchronously. Real dynamic-import behavior is asserted
// in e2e/map.spec.ts; the test here is structural — does the RSC pass parks
// through to the client island?
vi.mock("@/components/map/MapViewLoader", () => ({
  MapViewLoader: (props: { parks?: unknown }) => (
    <div
      data-testid="mock-map-view"
      data-park-count={Array.isArray(props.parks) ? props.parks.length : 0}
    >
      MapView placeholder
    </div>
  ),
}));

import MapPage from "./page";

describe("/map/ RSC page", () => {
  it("renders the sr-only h1 'Pennsylvania Skateparks Map'", async () => {
    render(await MapPage());
    expect(
      screen.getByRole("heading", { level: 1, name: /pennsylvania skateparks map/i }),
    ).toBeInTheDocument();
  });

  it("renders the visible-by-default fallback list with one <a> per park (CMT-3)", async () => {
    render(await MapPage());
    const list = screen.getByRole("list", { name: /all pennsylvania skateparks/i });
    expect(list).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    // All links in the fallback list point at /park/<slug>.
    const profileLinks = links.filter((a) => a.getAttribute("href")?.startsWith("/park/"));
    expect(profileLinks).toHaveLength(3);
    expect(profileLinks[0]).toHaveAttribute("href", "/park/fdr");
    expect(profileLinks[1]).toHaveAttribute("href", "/park/bayne");
    expect(profileLinks[2]).toHaveAttribute("href", "/park/9th-poplar");
  });

  it("renders the fallback list with the map-fallback-list class (globals.css hook)", async () => {
    render(await MapPage());
    const list = screen.getByRole("list", { name: /all pennsylvania skateparks/i });
    expect(list).toHaveClass("map-fallback-list");
  });

  it("emits <link rel='preconnect'> to a.basemaps.cartocdn.com (CMT-4)", async () => {
    const { container } = render(await MapPage());
    // React 19 hoists <link> elements to document.head at runtime. happy-dom
    // honors this, so query both the container (early-render position) and
    // document.head (after hoist).
    const preconnect =
      container.querySelector('link[rel="preconnect"][href="https://a.basemaps.cartocdn.com"]') ||
      document.head.querySelector('link[rel="preconnect"][href="https://a.basemaps.cartocdn.com"]');
    expect(preconnect, "expected <link rel='preconnect'> for a.basemaps.cartocdn.com").not.toBeNull();
  });

  it("dynamic-imports MapView and passes the parks prop", async () => {
    render(await MapPage());
    const mockMap = screen.getByTestId("mock-map-view");
    expect(mockMap).toHaveAttribute("data-park-count", "3");
  });

  it("renders each park's name and city in the fallback (SEO/a11y indexable)", async () => {
    render(await MapPage());
    expect(screen.getByText("FDR Skatepark")).toBeInTheDocument();
    expect(screen.getByText("Bayne Skatepark")).toBeInTheDocument();
    // Two parks live in Philadelphia in the fixture; getAllByText handles both.
    expect(screen.getAllByText(/philadelphia, pa/i)).toHaveLength(2);
    expect(screen.getByText(/bellevue, pa/i)).toBeInTheDocument();
  });
});
