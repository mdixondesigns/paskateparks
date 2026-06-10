import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { JsonLd } from "./JsonLd";

// Phase 8 ship-review P0 (Claude adversarial subagent). JsonLd must escape
// not just less-than but also U+2028 and U+2029, which JSON.stringify leaves
// intact but JavaScript parses as line terminators inside script tags,
// splitting the JSON literal mid-value. A single Studio-entered park name
// containing either character would silently break the script tag AND
// every HTML node after it on the page.

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

function extractScript(markup: string): string {
  const match = markup.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!match || match[1] === undefined) throw new Error("no <script> tag in markup");
  return match[1];
}

describe("JsonLd - script-tag escape hardening", () => {
  it("escapes less-than so a name containing closing-script cannot bail the parser", () => {
    const data = { name: "Park</script><img onerror=alert(1)>" };
    const markup = renderToStaticMarkup(<JsonLd data={data} />);
    const body = extractScript(markup);
    expect(body).not.toContain("</script>");
    expect(body).toContain("\\u003c/script>");
  });

  it("escapes U+2028 (line separator) so JS parsers don't see a line break", () => {
    const data = { name: "Park" + LINE_SEP + "Name" };
    const markup = renderToStaticMarkup(<JsonLd data={data} />);
    const body = extractScript(markup);
    expect(body).not.toContain(LINE_SEP);
    expect(body).toContain("\\u2028");
  });

  it("escapes U+2029 (paragraph separator)", () => {
    const data = { name: "Park" + PARA_SEP + "Name" };
    const markup = renderToStaticMarkup(<JsonLd data={data} />);
    const body = extractScript(markup);
    expect(body).not.toContain(PARA_SEP);
    expect(body).toContain("\\u2029");
  });

  it("escaped body remains JSON.parse-able (round-trip preserves originals)", () => {
    const data = {
      name: "Park" + LINE_SEP + "Name",
      city: "City" + PARA_SEP + "State",
      desc: "Contains </script> tag",
    };
    const markup = renderToStaticMarkup(<JsonLd data={data} />);
    const body = extractScript(markup);
    const parsed = JSON.parse(body);
    expect(parsed.name).toBe("Park" + LINE_SEP + "Name");
    expect(parsed.city).toBe("City" + PARA_SEP + "State");
    expect(parsed.desc).toBe("Contains </script> tag");
  });

  it("emits standard JSON-LD content type", () => {
    const markup = renderToStaticMarkup(<JsonLd data={{ "@type": "ItemList" }} />);
    expect(markup).toContain('type="application/ld+json"');
  });
});
