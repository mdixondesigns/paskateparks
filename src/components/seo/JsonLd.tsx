// Tiny RSC component that emits a <script type="application/ld+json"> tag.
// Server-serialized; escapes three classes of character that JSON.stringify
// leaves alone but which break inline <script> parsing:
//
//   - "<"     defends against park names containing "</script>" (parser bail)
//   - U+2028  legal in JSON, but JavaScript parses it as a line terminator
//             inside script bodies, splitting the JSON literal mid-value
//   - U+2029  same hazard as U+2028 (paragraph separator)
//
// Without the U+2028/U+2029 escapes, a single Studio-entered park name or
// caption containing either char would silently break every page's JSON-LD
// AND any downstream HTML on the page after the script tag.

interface Props {
  data: object;
}

export function JsonLd({ data }: Props) {
  const serialized = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}
