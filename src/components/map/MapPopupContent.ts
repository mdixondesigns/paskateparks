// Phase 7 plan-eng-review 2A — popup nodes built via createElement +
// textContent + setAttribute. Zero HTML parsing surface; a park name
// containing HTML-like characters renders as literal text rather than
// injected markup. Defense-in-depth: Drizzle's writes are plain text and we
// control the data, but bindPopup(string) parses HTML — this builder removes
// the vector entirely.
//
// Rendered structure:
//
//   <div class="map-popup">
//     <p class="map-popup__title">{name}</p>
//     <p class="map-popup__loc">{city}, {state}</p>
//     <a class="map-popup__link" href="/park/{slug}">View profile →</a>
//   </div>
//
// BEM class hooks (map-popup, map-popup__title, etc.) are intentionally
// present without CSS rules — visual design is deferred per A6. The popup
// renders with Leaflet's default chrome plus browser-default link styling.
// When the visual pass lands, the styling targets these hooks without
// touching this builder.

export interface PopupPark {
  slug: string;
  name: string;
  city: string;
  state: string;
}

export function buildPopupNode(park: PopupPark): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "map-popup";

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
