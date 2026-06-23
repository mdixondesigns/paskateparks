"use client";

// Phase 7 — Leaflet client component for /map/.
//
//   ┌─ MapView lifecycle ─────────────────────────────────────────────┐
//   │                                                                 │
//   │   mount → init useEffect (runs once, deps=[]) ──┐                │
//   │     • L.map(container)                          │                │
//   │     • L.tileLayer(CARTO Positron).addTo(map)    │                │
//   │     • L.markerClusterGroup() — D12              │                │
//   │     • for each park → L.marker + bindPopup      │                │
//   │     • fitBounds(park bbox, padding=40)          │                │
//   │       └─ degenerate fallback → setView(PA, 7)   │                │
//   │     • document.body.dataset.mapMounted = "true" │  CMT-3 signal  │
//   │                                                 ▼                │
//   │   userLocation effect (deps=[geo.location]) → map.flyTo(loc, 11) │
//   │                                                                 │
//   │   unmount → cleanup → map.remove() + clear data-map-mounted     │
//   └─────────────────────────────────────────────────────────────────┘
//
// Plan-eng-review decisions baked in:
//   1A — raw Leaflet imperative API (no react-leaflet wrapper)
//   1F — fitBounds over hardcoded viewport
//   2A — popups via buildPopupNode (createElement + textContent)
//   CMT-1 — markercluster KEPT (Philly/Pittsburgh density needs it)
//   CMT-3 — data-map-mounted swap: visible fallback list goes sr-only on mount
//   CMT-4 — CARTO Positron tile basemap (was tile.openstreetmap.org in phase 7;
//           swapped post-ship for a more stylized minimal look and to close
//           the P1 OSM-public-tile-policy migration TODO)

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useRef } from "react";

import type { LatLngBoundsLike } from "@/lib/bbox-filter";

// Bundler footgun fix: Leaflet's default icon URLs point at paths that don't
// survive Next's build. Pin explicit URLs from the installed leaflet package.
// Next 16 + Turbopack returns the URL as a plain string; Webpack and the
// vitest mocks return a StaticImageData object ({src, width, height}). The
// resolveAssetUrl helper below normalizes both — accessing `.src` directly
// on the Turbopack-returned string yields undefined and ships markers with
// src="undefined" (the broken-image bug surfaced post-CARTO swap when the
// marker glyphs became visible against the lighter Positron base).
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import { buildPhotoUrl } from "@/components/park/ResponsiveImage";
import { geoButtonLabels, useGeolocation } from "@/lib/use-geolocation";
// Type-only import — server-only modules can be safely type-imported into
// client code (TS types don't ship to the browser bundle).
import type { MapParkRow } from "@/lib/park-query";

import { buildPopupNode } from "./MapPopupContent";

export function resolveAssetUrl(asset: unknown): string {
  return typeof asset === "string" ? asset : (asset as { src: string }).src;
}

L.Icon.Default.mergeOptions({
  iconUrl: resolveAssetUrl(iconUrl),
  iconRetinaUrl: resolveAssetUrl(iconRetinaUrl),
  shadowUrl: resolveAssetUrl(shadowUrl),
});

// CARTO Positron — minimal light basemap. Same OSM data underneath, rendered
// in a clean light-grey/cream style so pin clusters pop instead of competing
// with road labels and land-use color. Single subdomain (a.) — modern HTTP/2
// multiplexes one origin faster than the legacy a/b/c/d shard pattern, and
// keeps the preconnect <link> in page.tsx pointed at one host. Free tier:
// up to ~75K mapviews/mo without an API key per CARTO's public basemap
// policy; closes the P1 OSM-tile-policy TODO from CMT-5.
const TILE_URL = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_MAX_ZOOM = 20;
const PA_CENTROID: L.LatLngTuple = [40.9, -77.5];
const PA_DEFAULT_ZOOM = 7;
// City-level zoom — used both for the geo-grant flyTo target and the degenerate
// single-park fallback (when fitBounds would produce a NaN bbox).
const CLOSE_ZOOM = 11;
const FIT_BOUNDS_PADDING: L.PointTuple = [40, 40];
// Half the Leaflet.markercluster default (80px). Doubles the pins visible at
// page-load zoom while still collapsing Philly/Pittsburgh density (CMT-1).
const CLUSTER_RADIUS_PX = 40;
// Thumbnail-pin geometry. 40px circle (16px icon-anchor offset so the bottom
// of the ring sits over the actual lat/lng, matching the default Leaflet
// pin behavior). Popup-anchor pulls the popup up off the ring.
const THUMB_PIN_SIZE_PX = 40;
const THUMB_PIN_ANCHOR: L.PointTuple = [THUMB_PIN_SIZE_PX / 2, THUMB_PIN_SIZE_PX];
const THUMB_POPUP_ANCHOR: L.PointTuple = [0, -THUMB_PIN_SIZE_PX];
// ponytail: thumbnails render the existing 400w jpg into a 40px circle —
// 50KB × N pins. If Vercel bandwidth bills jump, add 80w to the WIDTHS
// arrays in ResponsiveImage.tsx + scripts/migrate-wp/photos.ts and re-run
// the migration to backfill the smaller rendition.

function buildThumbIcon(L_: typeof L, photoPath: string, parkName: string): L.DivIcon {
  // textContent on a detached node, then innerHTML read — safest way to
  // produce HTML-escaped strings without importing a sanitizer. Park names
  // are owner-authored (RLS deny-all-anon) but defense-in-depth.
  const safeName = (() => {
    const div = document.createElement("div");
    div.textContent = parkName;
    return div.innerHTML;
  })();
  const url = buildPhotoUrl(photoPath, 400);
  return L_.divIcon({
    className: "map-pin-thumb",
    html: `<img src="${url}" alt="${safeName}" loading="lazy" decoding="async" />`,
    iconSize: [THUMB_PIN_SIZE_PX, THUMB_PIN_SIZE_PX],
    iconAnchor: THUMB_PIN_ANCHOR,
    popupAnchor: THUMB_POPUP_ANCHOR,
  });
}

// P1-E locked labels via the shared factory. Idle/pending/error copy is
// identical to the homepage NearMeButton; only the denied-state CTA suffix
// differs ("use the list" here, "use the filter" on the homepage).
const FIND_ME_LABELS = geoButtonLabels("use the list");

// MapView consumes the same row shape park-query produces — single source of
// truth so future schema additions land in one place.
export type MapPark = MapParkRow;

export interface MapMoveEnd {
  /** Map bounds after the move settled. Plain shape — no Leaflet dependency. */
  bounds: LatLngBoundsLike;
  /** Center of the new view (lat, lng) and current zoom. */
  lat: number;
  lng: number;
  zoom: number;
}

export interface MapViewProps {
  parks: MapPark[];
  /** Optional initial view (lat/lng/zoom) — when present, used instead of the
   *  default fit-bounds-to-all-parks. Wrapper passes this from URL state. */
  initialView?: { lat: number; lng: number; zoom: number } | null;
  /** When changes to a non-null park id, the map zooms to show that marker
   *  (expanding any containing cluster) and opens its popup. T5 + T6 click
   *  sync — set this from the wrapper's selectedParkId state. */
  selectedParkId?: number | null;
  /** Fires after every map move/zoom settles. Wrapper composes this with
   *  useMapUrlState (URL write) and the bbox-filter button visibility. */
  onMoveEnd?: (event: MapMoveEnd) => void;
  /** Fires when the user clicks a park marker. Receives the park id. */
  onMarkerClick?: (parkId: number) => void;
}

export function MapView({
  parks,
  initialView,
  selectedParkId,
  onMoveEnd,
  onMarkerClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  // park.id → marker, so the selectedParkId effect can find the right marker
  // without iterating. Cleared in the unmount cleanup.
  const markersByParkIdRef = useRef<Map<number, L.Marker>>(new Map());
  // Latest-callback refs — let the init effect (empty deps) reach the LATEST
  // callbacks without re-running. Standard pattern for "init once, callback
  // can change between renders" in React.
  const onMoveEndRef = useRef<MapViewProps["onMoveEnd"]>(onMoveEnd);
  const onMarkerClickRef = useRef<MapViewProps["onMarkerClick"]>(onMarkerClick);
  const geo = useGeolocation();

  // Keep callback refs current without re-running init.
  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // Init effect — runs once. Intentionally empty deps; capturing `parks` by
  // closure is fine because the route is force-static (see
  // src/app/map/page.tsx: `export const dynamic = "force-static"`). Parks
  // won't change between mount and unmount; webhook revalidation triggers a
  // fresh build, which means a fresh page load + remount. If that route
  // config ever changes (e.g., switching to ISR), revisit this — the stale
  // closure on `parks` would silently render the wrong pin set.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    // Move attribution from bottom-right (Leaflet default) to top-right so
    // it doesn't visually compete with the floating Find-me button on small
    // viewports (<375px wide where the button's denied/error label runs
    // nearly the full width). Leaflet auto-mounts the attribution control;
    // we just relocate it.
    map.attributionControl.setPosition("topright");

    // Phase 7 ship-review adversarial fix (A4): we set data-map-mounted
    // (which CSS uses to hide the fallback list) only after the FIRST batch
    // of tiles loads successfully. If the tile provider is blocked or 502s,
    // tiles never load, data-map-mounted is never set, and the fallback list
    // stays visible — exactly the progressive-enhancement contract CMT-3
    // promised. `once` not `on` so a later pan/zoom doesn't re-trigger.
    const tileLayer = L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: TILE_MAX_ZOOM,
    });
    tileLayer.once("load", () => {
      document.body.dataset.mapMounted = "true";
    });
    tileLayer.addTo(map);

    const clusters = L.markerClusterGroup({ maxClusterRadius: CLUSTER_RADIUS_PX });
    clusterGroupRef.current = clusters;
    for (const park of parks) {
      // Parks with a hero photo get a thumbnail-circle divIcon; stub parks
      // (no photo yet) fall back to the default Leaflet pin.
      const marker = park.heroPhotoPath
        ? L.marker([park.lat, park.lng], {
            icon: buildThumbIcon(L, park.heroPhotoPath, park.name),
          })
        : L.marker([park.lat, park.lng]);
      // Lazy popup: the factory runs on first open, not at marker creation.
      // For 48 pins the upfront cost is fine, but the lazy form locks in
      // the scaling pattern as the directory grows past the 200-row tripwire.
      marker.bindPopup(() => buildPopupNode(park));
      // T5 — propagate marker clicks up to the wrapper. Latest-callback ref
      // so the init effect doesn't re-run when the prop changes.
      marker.on("click", () => onMarkerClickRef.current?.(park.id));
      clusters.addLayer(marker);
      markersByParkIdRef.current.set(park.id, marker);
    }
    map.addLayer(clusters);

    // T5/T7 — moveend feeds the wrapper bounds/center/zoom for the bbox
    // filter + URL state. We DON'T try to detect "was this user-driven?"
    // here — Leaflet's zoomstart/dragstart events fire on programmatic zoom
    // too, so a flag flipped on those is unreliable. Instead the wrapper
    // tracks which moves it initiated (initial fit, click sync, "See all")
    // via its own flags and decides whether the moveend should write URL
    // or show "Search this area."
    map.on("moveend", () => {
      if (!onMoveEndRef.current) return;
      const bounds = map.getBounds();
      const center = map.getCenter();
      onMoveEndRef.current({
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
    });

    // T5 — initial view precedence: URL-supplied view > all-parks fit-bounds >
    // PA centroid fallback. animate:false forces a single, synchronous-ish
    // moveend instead of the multi-event animation default — the wrapper
    // treats the first moveend as programmatic, and additional animation
    // moveends would otherwise leak as "user pan" and write the URL.
    if (initialView) {
      map.setView([initialView.lat, initialView.lng], initialView.zoom, { animate: false });
    } else if (parks.length === 0) {
      // Empty edge case — shouldn't happen because the RSC filters to open
      // parks-with-coords, but defend anyway. 48/48 currently have coords.
      map.setView(PA_CENTROID, PA_DEFAULT_ZOOM, { animate: false });
    } else {
      const lats = parks.map((p) => p.lat);
      const lngs = parks.map((p) => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      // R4 fallback: degenerate single-point bbox would make fitBounds NaN.
      if (minLat === maxLat && minLng === maxLng) {
        map.setView([minLat, minLng], CLOSE_ZOOM, { animate: false });
      } else {
        map.fitBounds(
          [
            [minLat, minLng],
            [maxLat, maxLng],
          ],
          { padding: FIT_BOUNDS_PADDING, animate: false },
        );
      }
    }

    // CMT-3 mount signal moved into the tileLayer.once("load") handler above
    // per A4 fix — only flip to "mounted" state once tiles actually arrive.

    return () => {
      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
      markersByParkIdRef.current.clear();
      delete document.body.dataset.mapMounted;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init runs once; see comment above
  }, []);

  // userLocation effect — fly to user on grant. Doesn't re-init the map.
  useEffect(() => {
    if (!mapRef.current || !geo.location) return;
    mapRef.current.flyTo([geo.location.lat, geo.location.lng], CLOSE_ZOOM, {
      duration: 1.5,
    });
  }, [geo.location]);

  // T5 — selectedParkId effect. When the wrapper picks a park (list-card
  // click, hover, URL restore), expand any containing cluster, fly to the
  // marker, and open its popup. zoomToShowLayer is the Leaflet.markercluster
  // API that handles "the marker might be inside a collapsed cluster" —
  // without it, openPopup on a clustered marker no-ops because the marker
  // isn't actually in the DOM until the cluster expands.
  useEffect(() => {
    if (selectedParkId == null) return;
    const marker = markersByParkIdRef.current.get(selectedParkId);
    const cluster = clusterGroupRef.current;
    if (!marker || !cluster) return;
    cluster.zoomToShowLayer(marker, () => marker.openPopup());
  }, [selectedParkId]);

  return (
    <div className="relative h-screen w-full">
      <div
        ref={containerRef}
        // Leaflet needs a positioned container with a real height.
        className="absolute inset-0"
        aria-label="Map of Pennsylvania skateparks"
        role="application"
      />
      {geo.supported ? (
        <button
          type="button"
          onClick={geo.request}
          disabled={geo.disabled}
          aria-busy={geo.status === "pending"}
          // z-index puts the button above Leaflet's panes (which sit at
          // z-index ≤ 700 by default). bottom/right floats it over the map.
          // Attribution control was relocated to topright in the init effect
          // so this button has the bottom-right zone uncontested on mobile.
          className="absolute bottom-4 right-4 z-[1000] rounded border bg-white px-4 py-2 text-sm font-medium shadow disabled:opacity-60"
        >
          {FIND_ME_LABELS[geo.status]}
        </button>
      ) : null}
    </div>
  );
}
