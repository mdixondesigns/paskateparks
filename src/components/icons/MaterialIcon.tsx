// Google Material Symbols (Outlined, default weight/fill/grade), Apache 2.0.
// Path data pulled directly from fonts.gstatic.com (Google's own icon CDN),
// not hand-drawn. Inline SVG rather than the webfont: the full variable icon
// font is a multi-thousand-glyph, multi-hundred-KB download for a handful of
// icons on any given page — a page should only pay for the icons it uses.
// Add new icons here as more of the site adopts this library.
const PATHS = {
  check: "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
  block:
    "M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q54 0 104-17.5t92-50.5L228-676q-33 42-50.5 92T160-480q0 134 93 227t227 93Zm252-124q33-42 50.5-92T800-480q0-134-93-227t-227-93q-54 0-104 17.5T284-732l448 448ZM480-480Z",
  chevron_right: "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
} as const;

export type MaterialIconName = keyof typeof PATHS;

interface Props {
  name: MaterialIconName;
  className?: string;
}

// Decorative by default (aria-hidden) — icons here are always paired with a
// visible label or an aria-label on a wrapping element, per VISUAL-DESIGN.md
// §17 ("color is never the only signal").
export function MaterialIcon({ name, className }: Props) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
