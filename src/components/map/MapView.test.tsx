import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Phase 7 plan-eng-review C12 — Vitest with mocked Leaflet is a smoke-level
// check that the right calls fire in the right shape. Real Leaflet behavior
// (tile rendering, marker tap, cluster expansion, attribution visibility) is
// covered by e2e/map.spec.ts in Playwright. Don't try to assert pixel-level
// Leaflet output here.

// Stable mock instances we can assert against per test. Reset in beforeEach.
// Hoisted so the vi.mock factory below (which is itself hoisted above the
// `import MapView` at the bottom of this file) can close over them.
// vi.fn<(...args: unknown[]) => unknown>() widens the call signature so
// .mock.calls[i][j] doesn't index into a `[]` tuple type.
const { mapInstance, tileLayerInstance, clusterGroupInstance, markerInstance, L } = vi.hoisted(() => {
  type AnyFn = (...args: unknown[]) => unknown;
  const map = {
    addLayer: vi.fn<AnyFn>(),
    setView: vi.fn<AnyFn>(),
    fitBounds: vi.fn<AnyFn>(),
    flyTo: vi.fn<AnyFn>(),
    remove: vi.fn<AnyFn>(),
    // F5: phase 7 ship-review fix — MapView relocates attribution to topright
    // to avoid the floating Find-me button's overlap on small viewports.
    attributionControl: { setPosition: vi.fn<AnyFn>() },
  };
  // Tile layer mock includes `once` so the A4 mount-on-tile-load handler can
  // be installed and invoked from tests (callable to simulate tile success).
  const tile = {
    addTo: vi.fn<AnyFn>(),
    once: vi.fn<AnyFn>(),
  };
  tile.addTo.mockImplementation(() => tile);
  // Capture the load callback so tests can drive the mount transition.
  tile.once.mockImplementation((..._args: unknown[]) => {
    // Synchronously fire the load callback for tests that expect immediate
    // mount. Real Leaflet fires this when the first tile batch loads.
    const cb = _args[1] as (() => void) | undefined;
    cb?.();
    return tile;
  });
  const cluster = { addLayer: vi.fn<AnyFn>() };
  const marker = { bindPopup: vi.fn<AnyFn>() };
  marker.bindPopup.mockImplementation(() => marker);
  return {
    mapInstance: map,
    tileLayerInstance: tile,
    clusterGroupInstance: cluster,
    markerInstance: marker,
    L: {
      map: vi.fn<AnyFn>(() => map),
      tileLayer: vi.fn<AnyFn>(() => tile),
      markerClusterGroup: vi.fn<AnyFn>(() => cluster),
      marker: vi.fn<AnyFn>(() => marker),
      // divIcon mock returns a tagged sentinel so the assertion can verify
      // a divIcon was constructed (vs. default-pin parks below).
      divIcon: vi.fn<AnyFn>((opts: unknown) => ({ __divIcon: true, opts })),
      Icon: { Default: { mergeOptions: vi.fn<AnyFn>() } },
    },
  };
});

vi.mock("leaflet", () => ({ default: L }));
vi.mock("leaflet.markercluster", () => ({}));
// Leaflet ships its CSS as a real file — vitest config has css:false but the
// `?inline` query is sometimes still imported. Mock the CSS paths so the
// import doesn't try to resolve actual CSS.
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.Default.css", () => ({}));
// Image imports under Next return StaticImageData { src: string, ... }.
vi.mock("leaflet/dist/images/marker-icon.png", () => ({
  default: { src: "/mock-icon.png", width: 25, height: 41 },
}));
vi.mock("leaflet/dist/images/marker-icon-2x.png", () => ({
  default: { src: "/mock-icon-2x.png", width: 50, height: 82 },
}));
vi.mock("leaflet/dist/images/marker-shadow.png", () => ({
  default: { src: "/mock-shadow.png", width: 41, height: 41 },
}));

import { MapView, resolveAssetUrl, type MapPark } from "./MapView";

const PA_PARKS: MapPark[] = [
  { id: 1, slug: "fdr", name: "FDR Skatepark", city: "Philadelphia", state: "PA", lat: 39.91, lng: -75.18, heroPhotoPath: "parks/fdr/photo-00" },
  { id: 2, slug: "bayne", name: "Bayne Skatepark", city: "Bellevue", state: "PA", lat: 40.5, lng: -80.05, heroPhotoPath: "parks/bayne/photo-00" },
  // Stub park (no photo) — exercises the plain-pin fallback path.
  { id: 3, slug: "9th-poplar", name: "9th and Poplar", city: "Philadelphia", state: "PA", lat: 39.97, lng: -75.16, heroPhotoPath: null },
];

beforeEach(() => {
  // Reset all mock call records but keep the mock implementations.
  mapInstance.addLayer.mockClear();
  mapInstance.setView.mockClear();
  mapInstance.fitBounds.mockClear();
  mapInstance.flyTo.mockClear();
  mapInstance.remove.mockClear();
  tileLayerInstance.addTo.mockClear();
  tileLayerInstance.once.mockClear();
  tileLayerInstance.once.mockImplementation((..._args: unknown[]) => {
    const cb = _args[1] as (() => void) | undefined;
    cb?.();
    return tileLayerInstance;
  });
  clusterGroupInstance.addLayer.mockClear();
  markerInstance.bindPopup.mockClear();
  L.map.mockClear();
  L.tileLayer.mockClear();
  L.markerClusterGroup.mockClear();
  L.marker.mockClear();
  L.divIcon.mockClear();
  // Note: don't clear L.Icon.Default.mergeOptions — it's called once at module
  // load (the bundler-footgun fix lives at the top of MapView.tsx, not inside
  // useEffect). Clearing it here would erase the only call we want to assert.
  // happy-dom doesn't ship geolocation. Stub so the Find-me button renders.
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    geolocation: { getCurrentPosition: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Clean up any data-map-mounted that leaked from a failed test.
  delete document.body.dataset.mapMounted;
});

describe("MapView — Leaflet init flow", () => {
  it("creates the map instance once via L.map(containerRef)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(L.map).toHaveBeenCalledTimes(1);
  });

  it("attaches the CARTO Positron tile layer (CMT-4: single subdomain for HTTP/2)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    const url = L.tileLayer.mock.calls[0]?.[0];
    expect(url).toBe("https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png");
    expect(tileLayerInstance.addTo).toHaveBeenCalledWith(mapInstance);
  });

  it("F5 (ship-review): relocates the attribution control to topright", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(mapInstance.attributionControl.setPosition).toHaveBeenCalledWith("topright");
  });

  it("creates one markerClusterGroup and adds one marker per park (CMT-1: D12)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(L.markerClusterGroup).toHaveBeenCalledTimes(1);
    expect(L.markerClusterGroup).toHaveBeenCalledWith({ maxClusterRadius: 40 });
    expect(L.marker).toHaveBeenCalledTimes(PA_PARKS.length);
    expect(clusterGroupInstance.addLayer).toHaveBeenCalledTimes(PA_PARKS.length);
    // Marker coords match park lat/lng order.
    const calledCoords = L.marker.mock.calls.map((c) => c[0]);
    expect(calledCoords).toEqual([
      [39.91, -75.18],
      [40.5, -80.05],
      [39.97, -75.16],
    ]);
  });

  it("uses divIcon thumbnail markers for parks with photos and plain pins for stubs", () => {
    render(<MapView parks={PA_PARKS} />);
    // PA_PARKS has 2 parks with photos + 1 stub.
    expect(L.divIcon).toHaveBeenCalledTimes(2);
    // Verify the marker call for the stub (3rd park) had no icon option.
    const markerCalls = L.marker.mock.calls;
    expect(markerCalls[0]?.[1]).toMatchObject({ icon: { __divIcon: true } });
    expect(markerCalls[1]?.[1]).toMatchObject({ icon: { __divIcon: true } });
    expect(markerCalls[2]?.[1]).toBeUndefined();
    // Generated divIcon html embeds the photo URL + escaped park name.
    const firstIconOpts = (L.divIcon.mock.calls[0]?.[0] ?? {}) as {
      html: string;
      iconSize: [number, number];
    };
    expect(firstIconOpts.html).toContain("parks/fdr/photo-00@400w.jpg");
    expect(firstIconOpts.html).toContain('alt="FDR Skatepark"');
    expect(firstIconOpts.iconSize).toEqual([40, 40]);
  });

  it("binds a popup factory (lazy form per F3) that returns an HTMLElement", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(markerInstance.bindPopup).toHaveBeenCalledTimes(PA_PARKS.length);
    // F3 (ship-review): bindPopup receives a factory function, not the
    // built node directly — Leaflet calls the factory on first open. Verify
    // the factory exists and returns a real .map-popup element.
    const popupFactory = markerInstance.bindPopup.mock.calls[0]?.[0] as () => HTMLElement;
    expect(typeof popupFactory).toBe("function");
    const popupNode = popupFactory();
    expect(popupNode).toBeInstanceOf(HTMLElement);
    expect(popupNode.className).toBe("map-popup");
  });

  it("calls fitBounds with park bbox + padding [40,40] (1F)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(mapInstance.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, opts] = mapInstance.fitBounds.mock.calls[0] ?? [];
    expect(bounds).toEqual([
      [39.91, -80.05],
      [40.5, -75.16],
    ]);
    expect(opts).toEqual({ padding: [40, 40] });
    expect(mapInstance.setView).not.toHaveBeenCalled();
  });

  it("R4 fallback: parks.length === 0 → setView(PA centroid, 7)", () => {
    render(<MapView parks={[]} />);
    expect(mapInstance.setView).toHaveBeenCalledWith([40.9, -77.5], 7);
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("R4 fallback: degenerate single-point bbox → setView at that point + zoom 11", () => {
    const single: MapPark[] = [
      { id: 1, slug: "x", name: "X", city: "C", state: "PA", lat: 40.5, lng: -76.0, heroPhotoPath: null },
    ];
    render(<MapView parks={single} />);
    expect(mapInstance.setView).toHaveBeenCalledWith([40.5, -76.0], 11);
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("CMT-3 mount signal: sets document.body.dataset.mapMounted once the tile layer fires 'load' (A4 fix)", () => {
    expect(document.body.dataset.mapMounted).toBeUndefined();
    render(<MapView parks={PA_PARKS} />);
    // Test mock fires tile.once('load', cb) synchronously — so the dataset
    // attribute IS set by render time. The real Leaflet TileLayer fires
    // 'load' asynchronously when tiles complete.
    expect(document.body.dataset.mapMounted).toBe("true");
    // And: the handler was installed on the 'load' event (not on init).
    expect(tileLayerInstance.once).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("A4 (ship-review): if tiles never load, data-map-mounted stays unset (fallback list stays visible)", () => {
    // Override the default test mock to NOT fire the load callback —
    // simulates a blocked-OSM scenario where MapView mounts but tiles 502.
    // Don't fire the load callback this time — simulates blocked OSM tiles.
    tileLayerInstance.once.mockImplementationOnce(() => tileLayerInstance);
    render(<MapView parks={PA_PARKS} />);
    expect(document.body.dataset.mapMounted).toBeUndefined();
  });

  it("CMT-3 cleanup: clears data-map-mounted on unmount + calls map.remove()", () => {
    const { unmount } = render(<MapView parks={PA_PARKS} />);
    expect(document.body.dataset.mapMounted).toBe("true");
    unmount();
    expect(document.body.dataset.mapMounted).toBeUndefined();
    expect(mapInstance.remove).toHaveBeenCalledTimes(1);
  });

  it("merges the icon URL fix into L.Icon.Default (bundler footgun)", () => {
    render(<MapView parks={PA_PARKS} />);
    // mergeOptions is called at module import, not per-render. Assert it has
    // been called at least once with our three pinned URLs.
    const calls = L.Icon.Default.mergeOptions.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const merged = calls[calls.length - 1]?.[0];
    expect(merged).toMatchObject({
      iconUrl: "/mock-icon.png",
      iconRetinaUrl: "/mock-icon-2x.png",
      shadowUrl: "/mock-shadow.png",
    });
  });
});

describe("resolveAssetUrl — Turbopack/Webpack shape normalizer", () => {
  // Regression lock: Next 16 + Turbopack returns image imports as a plain
  // URL string; Webpack and the vitest mocks return a StaticImageData object.
  // Accessing `.src` directly on the string yields undefined and shipped
  // src="undefined" markers on /map/. The full mergeOptions assertion above
  // exercises the object path via the existing vi.mock; this block locks
  // the string path so a future refactor can't silently drop it.
  it("returns the string verbatim when handed a string (Turbopack runtime)", () => {
    expect(resolveAssetUrl("/marker-icon.png")).toBe("/marker-icon.png");
  });

  it("returns the .src when handed a StaticImageData object (Webpack/tests)", () => {
    expect(resolveAssetUrl({ src: "/marker-icon.png", width: 25, height: 41 })).toBe(
      "/marker-icon.png",
    );
  });
});

describe("MapView — Find-me button", () => {
  it("renders the idle label when geolocation is supported", async () => {
    render(<MapView parks={PA_PARKS} />);
    expect(await screen.findByRole("button", { name: /find parks near me/i })).toBeInTheDocument();
  });

  it("renders no button when navigator.geolocation is undefined", () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, geolocation: undefined });
    render(<MapView parks={PA_PARKS} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls map.flyTo with user coords + zoom 11 after a successful fix", async () => {
    type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
    const getCurrentPosition = vi.fn((success: Success) => {
      success({ coords: { latitude: 40.45, longitude: -79.99 } });
    });
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      geolocation: { getCurrentPosition },
    });
    render(<MapView parks={PA_PARKS} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() =>
      expect(mapInstance.flyTo).toHaveBeenCalledWith([40.45, -79.99], 11, { duration: 1.5 }),
    );
  });
});
