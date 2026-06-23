import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Phase 6 homepage RSC integration test. The Page itself is an async server
// component — Vitest can render it by awaiting the returned JSX (Next 16 +
// React 19 supports this in the test env so long as the data layer is mocked).
//
// The vi.mock factory below is hoisted by Vitest above the static `import Home`
// at the top of the file, so the imported module already sees the mocked
// getAllParksForHomepage by the time Home() executes.

vi.mock("@/lib/park-query", () => ({
  getAllParksForHomepage: vi.fn(async () => [
    {
      id: 1,
      slug: "fdr",
      name: "FDR Skatepark",
      city: "Philadelphia",
      state: "PA",
      lat: 39.91,
      lng: -75.18,
      heroPhotoPath: "parks/fdr/photo-01",
    },
    {
      id: 2,
      slug: "bayne-skatepark",
      name: "Bayne Skatepark",
      city: "Bellevue",
      state: "PA",
      lat: 40.5,
      lng: -80.05,
      heroPhotoPath: null,
    },
  ]),
}));

// SyncedMapList (T2) uses useMapUrlState, which calls useRouter +
// useSearchParams from next/navigation. Vitest doesn't ship the App
// Router context — stub the hooks at the module boundary.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  // Park-modal phase: SyncedMapList derives modalParkId from the pathname.
  usePathname: () => "/",
}));

import Home from "./page";

beforeEach(() => {
  // Stub scrollIntoView via spyOn so afterEach can restore the prototype
  // cleanly. Plain assignment would leak the mock across test files.
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  // happy-dom doesn't ship navigator.geolocation by default. Stub it so the
  // client-island NearMeButton's feature detect passes and the button renders.
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    geolocation: { getCurrentPosition: vi.fn() },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 6 homepage", () => {
  it("renders the hero copy and an h1", async () => {
    render(await Home());
    expect(
      screen.getByRole("heading", { level: 1, name: /pennsylvania skateparks/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/directory of public skateparks across pennsylvania/i),
    ).toBeInTheDocument();
  });

  it("renders the <main id='main'> landmark (skip-link target)", async () => {
    const { container } = render(await Home());
    expect(container.querySelector("main#main")).not.toBeNull();
  });

  it("renders every park's name in the initial HTML (SEO bet per D19)", async () => {
    render(await Home());
    expect(screen.getByText("FDR Skatepark")).toBeInTheDocument();
    expect(screen.getByText("Bayne Skatepark")).toBeInTheDocument();
  });

  it("includes a Find parks near me button (geolocation entry)", async () => {
    render(await Home());
    expect(screen.getByRole("button", { name: /find parks near me/i })).toBeInTheDocument();
  });

  it("includes a filter input", async () => {
    render(await Home());
    expect(screen.getByPlaceholderText(/filter by name or city/i)).toBeInTheDocument();
  });
});
