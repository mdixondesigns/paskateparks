// Phase 7 plan-eng-review 2A — popup nodes built via createElement +
// textContent + setAttribute. Zero HTML parsing surface; a park name
// containing HTML-like characters renders as literal text rather than
// injected markup. Defense-in-depth: Drizzle's writes are plain text and we
// control the data, but bindPopup(string) parses HTML — this builder removes
// the vector entirely.
//
// Rendered structure (heroPhotoPath present):
//
//   <div class="map-popup">
//     <img class="map-popup__thumb" src="…@400w.jpg" alt="" />
//     <p class="map-popup__title">{name}</p>
//     <p class="map-popup__loc">{city}, {state}</p>
//     <a class="map-popup__link" href="/park/{slug}">View profile →</a>
//   </div>
//
// When heroPhotoPath is null (stub park, no photos yet) the <img> is skipped.

import { buildPhotoUrl } from "@/components/park/ResponsiveImage";

export interface PopupPark {
  slug: string;
  name: string;
  city: string;
  state: string;
  heroPhotoPath: string | null;
}

export function buildPopupNode(park: PopupPark): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "map-popup";

  if (park.heroPhotoPath) {
    const img = document.createElement("img");
    img.className = "map-popup__thumb";
    img.setAttribute("src", buildPhotoUrl(park.heroPhotoPath, 400));
    // Decorative in popup context — the title below names the park.
    img.setAttribute("alt", "");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    root.appendChild(img);
  }

  const title = document.createElement("p");
  title.className = "map-popup__title";
  title.textContent = park.name;
  root.appendChild(title);

  const loc = document.createElement("p");
  loc.className = "map-popup__loc";
  loc.textContent = `${park.city}, ${park.state}`;
  root.appendChild(loc);

  const link = document.createElement("a");
  link.className = "map-popup__link";
  link.setAttribute("href", `/park/${encodeURIComponent(park.slug)}`);
  link.textContent = "View profile →";
  root.appendChild(link);

  return root;
}
