import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

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
const { mapInstance, tileLayerInstance, createdMarkers, L } = vi.hoisted(() => {
  type AnyFn = (...args: unknown[]) => unknown;
  // Event handlers attached to the map via `map.on(event, cb)` — keyed by
  // event name so tests can fire them imperatively.
  const mapHandlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  // Configurable view state — tests can mutate these before firing 'moveend'
  // to simulate where the map is after a user pan/zoom.
  const mapView = {
    bounds: { south: 39.0, west: -80.5, north: 42.5, east: -74.7 },
    center: { lat: 40.9, lng: -77.5 },
    zoom: 7,
  };
  // Cast through `unknown` for the typed implementations — vi.fn<AnyFn>'s
  // (...args: unknown[]) constraint doesn't unify with our specific param
  // types, but the runtime behavior is correct.
  const onImpl = ((event: string, cb: (...args: unknown[]) => unknown) => {
    const list = mapHandlers.get(event) ?? [];
    list.push(cb);
    mapHandlers.set(event, list);
    return map;
  }) as unknown as AnyFn;
  const getBoundsImpl = (() => ({
    getSouth: () => mapView.bounds.south,
    getWest: () => mapView.bounds.west,
    getNorth: () => mapView.bounds.north,
    getEast: () => mapView.bounds.east,
  })) as unknown as AnyFn;
  const map = {
    addLayer: vi.fn<AnyFn>(),
    removeLayer: vi.fn<AnyFn>(),
    setView: vi.fn<AnyFn>(),
    fitBounds: vi.fn<AnyFn>(),
    flyTo: vi.fn<AnyFn>(),
    remove: vi.fn<AnyFn>(),
    on: vi.fn<AnyFn>(onImpl),
    getBounds: vi.fn<AnyFn>(getBoundsImpl),
    getCenter: vi.fn<AnyFn>(() => mapView.center),
    getZoom: vi.fn<AnyFn>(() => mapView.zoom),
    /** Test helper — fire all registered handlers for an event. */
    __fire: (event: string, ...args: unknown[]) => {
      const list = mapHandlers.get(event) ?? [];
      for (const cb of list) cb(...args);
    },
    /** Test helper — reconfigure the map view returned by getBounds/center/zoom. */
    __setView: (bounds: typeof mapView.bounds, center: typeof mapView.center, zoom: number) => {
      mapView.bounds = bounds;
      mapView.center = center;
      mapView.zoom = zoom;
    },
    /** Test helper — clear all registered event handlers (called in beforeEach). */
    __resetHandlers: () => mapHandlers.clear(),
    attributionControl: { setPosition: vi.fn<AnyFn>() },
  };
  const tile = {
    addTo: vi.fn<AnyFn>(),
    once: vi.fn<AnyFn>(),
  };
  tile.addTo.mockImplementation(() => tile);
  tile.once.mockImplementation((..._args: unknown[]) => {
    const cb = _args[1] as (() => void) | undefined;
    cb?.();
    return tile;
  });
  // Tracks every marker created via L.marker — tests use this to find a
  // specific marker by park-coord and assert per-marker behavior (click
  // handlers, openPopup, etc.).
  const createdMarkers: Array<{
    coord: [number, number];
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
    bindPopup: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    openPopup: ReturnType<typeof vi.fn>;
    addTo: ReturnType<typeof vi.fn>;
    setLatLng: ReturnType<typeof vi.fn>;
    __fire: (event: string, ...args: unknown[]) => void;
  }> = [];
  return {
    mapInstance: map,
    tileLayerInstance: tile,
    createdMarkers,
    L: {
      map: vi.fn<AnyFn>(() => map),
      tileLayer: vi.fn<AnyFn>(() => tile),
      marker: vi.fn<AnyFn>(((coord: [number, number]) => {
        const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
        // Build the mock skeleton first so the on/bindPopup impls can
        // reference `m` (which returns `m` for chainable Leaflet API).
        const m = {
          coord,
          handlers,
          bindPopup: vi.fn<AnyFn>(),
          on: vi.fn<AnyFn>(),
          openPopup: vi.fn<AnyFn>(),
          addTo: vi.fn<AnyFn>(),
          setLatLng: vi.fn<AnyFn>(),
          __fire: (event: string, ...args: unknown[]) => {
            const list = handlers.get(event) ?? [];
            for (const cb of list) cb(...args);
          },
        };
        m.bindPopup.mockImplementation((() => m) as unknown as AnyFn);
        m.addTo.mockImplementation((() => m) as unknown as AnyFn);
        m.on.mockImplementation(((event: string, cb: (...args: unknown[]) => unknown) => {
          const list = handlers.get(event) ?? [];
          list.push(cb);
          handlers.set(event, list);
          return m;
        }) as unknown as AnyFn);
        createdMarkers.push(m);
        return m;
      }) as unknown as AnyFn),
      divIcon: vi.fn<AnyFn>((opts: unknown) => ({ __divIcon: true, opts })),
      Icon: { Default: { mergeOptions: vi.fn<AnyFn>() } },
    },
  };
});

// D6.2 — MapView calls useRouter() to drive the popup's router-aware click.
// Stub with a vi.fn so individual tests can assert router.push calls.
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("leaflet", () => ({ default: L }));
// Leaflet ships its CSS as a real file — vitest config has css:false but the
// `?inline` query is sometimes still imported. Mock the CSS paths so the
// import doesn't try to resolve actual CSS.
vi.mock("leaflet/dist/leaflet.css", () => ({}));
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
  mapInstance.removeLayer.mockClear();
  mapInstance.setView.mockClear();
  mapInstance.fitBounds.mockClear();
  mapInstance.flyTo.mockClear();
  mapInstance.remove.mockClear();
  mapInstance.on.mockClear();
  mapInstance.getBounds.mockClear();
  mapInstance.getCenter.mockClear();
  mapInstance.getZoom.mockClear();
  mapInstance.__resetHandlers();
  tileLayerInstance.addTo.mockClear();
  tileLayerInstance.once.mockClear();
  tileLayerInstance.once.mockImplementation((..._args: unknown[]) => {
    const cb = _args[1] as (() => void) | undefined;
    cb?.();
    return tileLayerInstance;
  });
  // createdMarkers is the source of truth for "what markers exist this test".
  // Clear it so each test starts with no leaked markers from prior renders.
  createdMarkers.length = 0;
  routerPush.mockClear();
  L.map.mockClear();
  L.tileLayer.mockClear();
  L.marker.mockClear();
  L.divIcon.mockClear();
  // Note: don't clear L.Icon.Default.mergeOptions — it's called once at module
  // load (the bundler-footgun fix lives at the top of MapView.tsx, not inside
  // useEffect). Clearing it here would erase the only call we want to assert.
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

  it("creates one marker per park and adds each directly to the map (clustering retired)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(L.marker).toHaveBeenCalledTimes(PA_PARKS.length);
    // Each marker calls .addTo(map) — no markerClusterGroup intermediary.
    for (const m of createdMarkers) {
      expect(m.addTo).toHaveBeenCalledWith(mapInstance);
    }
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
    // bindPopup is called once per marker; check by summing across the
    // per-marker mocks (T5 — markers are now distinct instances).
    const bindPopupTotal = createdMarkers.reduce(
      (sum, m) => sum + m.bindPopup.mock.calls.length,
      0,
    );
    expect(bindPopupTotal).toBe(PA_PARKS.length);
    // F3 (ship-review): bindPopup receives a factory function, not the
    // built node directly — Leaflet calls the factory on first open. Verify
    // the factory exists and returns a real .map-popup element.
    const popupFactory = createdMarkers[0]?.bindPopup.mock.calls[0]?.[0] as () => HTMLElement;
    expect(typeof popupFactory).toBe("function");
    const popupNode = popupFactory();
    expect(popupNode).toBeInstanceOf(HTMLElement);
    expect(popupNode.className).toBe("map-popup");
  });

  it("calls fitBounds with park bbox + padding [40,40] + animate:false (1F, T7)", () => {
    render(<MapView parks={PA_PARKS} />);
    expect(mapInstance.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, opts] = mapInstance.fitBounds.mock.calls[0] ?? [];
    expect(bounds).toEqual([
      [39.91, -80.05],
      [40.5, -75.16],
    ]);
    // animate:false (T7) prevents Leaflet's multi-event animation default
    // — without it, the initial fit fires several moveends and the wrapper
    // can't distinguish them from a user pan, leaking URL writes.
    expect(opts).toEqual({ padding: [40, 40], animate: false });
    expect(mapInstance.setView).not.toHaveBeenCalled();
  });

  it("R4 fallback: parks.length === 0 → setView(PA centroid, 7, animate:false)", () => {
    render(<MapView parks={[]} />);
    expect(mapInstance.setView).toHaveBeenCalledWith([40.9, -77.5], 7, { animate: false });
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("R4 fallback: degenerate single-point bbox → setView at that point + zoom 11 (animate:false)", () => {
    const single: MapPark[] = [
      { id: 1, slug: "x", name: "X", city: "C", state: "PA", lat: 40.5, lng: -76.0, heroPhotoPath: null },
    ];
    render(<MapView parks={single} />);
    expect(mapInstance.setView).toHaveBeenCalledWith([40.5, -76.0], 11, { animate: false });
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

  // T5 — new prop surface for the synced-layout wrapper.
  describe("T5: synced-layout props (selectedParkId, onMoveEnd, onMarkerClick, initialView)", () => {
    it("uses initialView (lat/lng/zoom) instead of fitBounds when provided", () => {
      render(<MapView parks={PA_PARKS} initialView={{ lat: 40.5, lng: -77.5, zoom: 9 }} />);
      expect(mapInstance.setView).toHaveBeenCalledWith([40.5, -77.5], 9, { animate: false });
      expect(mapInstance.fitBounds).not.toHaveBeenCalled();
    });

    it("falls back to fitBounds when initialView is null", () => {
      render(<MapView parks={PA_PARKS} initialView={null} />);
      expect(mapInstance.fitBounds).toHaveBeenCalledTimes(1);
    });

    it("binds moveend on the map (wrapper decides user-vs-programmatic, not MapView)", () => {
      render(<MapView parks={PA_PARKS} />);
      const eventsBound = mapInstance.on.mock.calls.map((c) => c[0]);
      expect(eventsBound).toContain("moveend");
      // Intentionally NOT bound — Leaflet's dragstart/zoomstart fire on
      // programmatic moves too, so they're unreliable as a user-driven
      // signal. SyncedMapList tracks which moves it initiated itself.
      expect(eventsBound).not.toContain("dragstart");
      expect(eventsBound).not.toContain("zoomstart");
    });

    it("fires onMoveEnd with lat/lng/zoom when moveend fires", () => {
      const onMoveEnd = vi.fn();
      render(<MapView parks={PA_PARKS} onMoveEnd={onMoveEnd} />);
      mapInstance.__setView(
        { south: 39.9, west: -76.0, north: 40.1, east: -75.0 },
        { lat: 40, lng: -75.5 },
        11,
      );
      mapInstance.__fire("moveend");
      // Bounds were dropped from the event shape (Plan A — sort by center,
      // never bbox-filter — so the wrapper only needs lat/lng/zoom).
      expect(onMoveEnd).toHaveBeenCalledExactlyOnceWith({
        lat: 40,
        lng: -75.5,
        zoom: 11,
      });
    });

    it("binds click on every marker and fires onMarkerClick with the park id", () => {
      const onMarkerClick = vi.fn();
      render(<MapView parks={PA_PARKS} onMarkerClick={onMarkerClick} />);
      // Each created marker should have a 'click' handler.
      expect(createdMarkers).toHaveLength(PA_PARKS.length);
      for (const m of createdMarkers) {
        const eventsBound = m.on.mock.calls.map((c) => c[0]);
        expect(eventsBound).toContain("click");
      }
      // Fire the click on the second marker (Bayne, id=2) — onMarkerClick(2).
      createdMarkers[1]!.__fire("click");
      expect(onMarkerClick).toHaveBeenCalledExactlyOnceWith(2);
    });

    it("selectedParkId effect calls marker.openPopup on the matching marker", () => {
      const { rerender } = render(<MapView parks={PA_PARKS} selectedParkId={null} />);
      expect(createdMarkers[1]?.openPopup).not.toHaveBeenCalled();
      // Park id=2 = Bayne (PA_PARKS[1]).
      rerender(<MapView parks={PA_PARKS} selectedParkId={2} />);
      expect(createdMarkers[1]?.openPopup).toHaveBeenCalledOnce();
    });

    it("selectedParkId set to a non-existent park id is a no-op (defensive)", () => {
      render(<MapView parks={PA_PARKS} selectedParkId={9999} />);
      for (const m of createdMarkers) expect(m.openPopup).not.toHaveBeenCalled();
    });
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

describe("MapView — userLocation prop (Plan A — lifted from MapView to SyncedMapList)", () => {
  it("does not call flyTo or create a dot when userLocation is null", () => {
    render(<MapView parks={PA_PARKS} userLocation={null} />);
    expect(mapInstance.flyTo).not.toHaveBeenCalled();
    // Only the park markers are created; no extra L.marker call for a dot.
    expect(L.marker).toHaveBeenCalledTimes(PA_PARKS.length);
  });

  it("flies to userLocation and creates a blue-dot marker on first non-null value", () => {
    const { rerender } = render(<MapView parks={PA_PARKS} userLocation={null} />);
    expect(L.marker).toHaveBeenCalledTimes(PA_PARKS.length);
    rerender(<MapView parks={PA_PARKS} userLocation={{ lat: 40.45, lng: -79.99 }} />);
    expect(mapInstance.flyTo).toHaveBeenCalledWith([40.45, -79.99], 11, { duration: 1.5 });
    // One extra marker created — the blue dot.
    expect(L.marker).toHaveBeenCalledTimes(PA_PARKS.length + 1);
    // The dot's options carry the user-location-marker className via divIcon.
    const lastDivIconCall = L.divIcon.mock.calls[L.divIcon.mock.calls.length - 1]?.[0] as
      | { className: string; html: string }
      | undefined;
    expect(lastDivIconCall?.className).toBe("user-location-marker");
    expect(lastDivIconCall?.html).toContain("user-location-dot");
  });

  it("moves the existing dot (no new marker) on subsequent userLocation changes", () => {
    const { rerender } = render(
      <MapView parks={PA_PARKS} userLocation={{ lat: 40.45, lng: -79.99 }} />,
    );
    const markerCountAfterFirst = L.marker.mock.calls.length;
    rerender(<MapView parks={PA_PARKS} userLocation={{ lat: 39.95, lng: -75.16 }} />);
    // No new marker created — setLatLng on the existing dot instead.
    expect(L.marker.mock.calls.length).toBe(markerCountAfterFirst);
    const dotMarker = createdMarkers[createdMarkers.length - 1];
    expect(dotMarker?.setLatLng).toHaveBeenCalledWith([39.95, -75.16]);
    // flyTo fires again for the new location.
    expect(mapInstance.flyTo).toHaveBeenLastCalledWith([39.95, -75.16], 11, { duration: 1.5 });
  });

  it("removes the dot when userLocation transitions back to null", () => {
    const { rerender } = render(
      <MapView parks={PA_PARKS} userLocation={{ lat: 40.45, lng: -79.99 }} />,
    );
    const dotMarker = createdMarkers[createdMarkers.length - 1];
    rerender(<MapView parks={PA_PARKS} userLocation={null} />);
    expect(mapInstance.removeLayer).toHaveBeenCalledWith(dotMarker);
  });
});

describe("MapView — popup events drive the persistent list highlight", () => {
  it("binds popupopen + popupclose on every marker", () => {
    render(<MapView parks={PA_PARKS} />);
    for (const m of createdMarkers) {
      const events = m.on.mock.calls.map((c) => c[0]);
      expect(events).toContain("popupopen");
      expect(events).toContain("popupclose");
    }
  });

  it("fires onPopupOpen with the park id when popupopen fires on a marker", () => {
    const onPopupOpen = vi.fn();
    render(<MapView parks={PA_PARKS} onPopupOpen={onPopupOpen} />);
    // Fire popupopen on the second marker (Bayne, id=2).
    createdMarkers[1]!.__fire("popupopen");
    expect(onPopupOpen).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("fires onPopupClose with the park id when popupclose fires", () => {
    const onPopupClose = vi.fn();
    render(<MapView parks={PA_PARKS} onPopupClose={onPopupClose} />);
    createdMarkers[0]!.__fire("popupclose");
    expect(onPopupClose).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe("MapView — hoveredParkId opens popup", () => {
  it("calls marker.openPopup on the matching id", () => {
    const { rerender } = render(<MapView parks={PA_PARKS} hoveredParkId={null} />);
    expect(createdMarkers[1]?.openPopup).not.toHaveBeenCalled();
    rerender(<MapView parks={PA_PARKS} hoveredParkId={2} />);
    expect(createdMarkers[1]?.openPopup).toHaveBeenCalledOnce();
  });

  it("non-existent hoveredParkId is a no-op (defensive)", () => {
    render(<MapView parks={PA_PARKS} hoveredParkId={9999} />);
    for (const m of createdMarkers) expect(m.openPopup).not.toHaveBeenCalled();
  });
});

describe("MapView — popup options (autoPan disabled to prevent hover stutter)", () => {
  it("binds popup with autoPan: false", () => {
    render(<MapView parks={PA_PARKS} />);
    // bindPopup signature is (factory, options) — assert the options bag.
    for (const m of createdMarkers) {
      const calls = m.bindPopup.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const [, opts] = calls[0]!;
      expect(opts).toEqual({ autoPan: false });
    }
  });
});

describe("MapView — D6.2 router-aware popup link", () => {
  it("plain-click on the popup's View profile link calls router.push (no full nav)", () => {
    render(<MapView parks={PA_PARKS} />);
    // Invoke the popup factory for the first marker — that's what Leaflet
    // does lazily on first popup-open. The factory returns the DOM node.
    const factory = createdMarkers[0]!.bindPopup.mock.calls[0]![0] as () => HTMLElement;
    const node = factory();
    document.body.appendChild(node);
    const link = node.querySelector("a.map-popup__link") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    // Native dispatchEvent fires a click; the link's installed listener
    // intercepts and calls router.push instead of full navigation.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    expect(routerPush).toHaveBeenCalledExactlyOnceWith("/park/fdr");
    expect(event.defaultPrevented).toBe(true);
    document.body.removeChild(node);
  });

  it("modifier-click (metaKey) preserves browser default (no router.push, no preventDefault)", () => {
    render(<MapView parks={PA_PARKS} />);
    const factory = createdMarkers[0]!.bindPopup.mock.calls[0]![0] as () => HTMLElement;
    const node = factory();
    document.body.appendChild(node);
    const link = node.querySelector("a.map-popup__link") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    link.dispatchEvent(event);
    expect(routerPush).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(node);
  });
});
