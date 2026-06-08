import { describe, expect, it } from "vitest";

import { buildPopupNode } from "./MapPopupContent";

describe("buildPopupNode — pure DOM builder (phase 7 plan-eng-review 2A)", () => {
  const FDR = { slug: "fdr", name: "FDR Skatepark", city: "Philadelphia", state: "PA" };

  it("returns a DIV element with the documented class", () => {
    const node = buildPopupNode(FDR);
    expect(node.tagName).toBe("DIV");
    expect(node.className).toBe("map-popup");
  });

  it("renders three children in order: title (p), location (p), link (a)", () => {
    const node = buildPopupNode(FDR);
    expect(node.children).toHaveLength(3);
    expect(node.children[0]?.tagName).toBe("P");
    expect(node.children[1]?.tagName).toBe("P");
    expect(node.children[2]?.tagName).toBe("A");
  });

  it("title node uses textContent = park.name (no HTML parsing)", () => {
    const node = buildPopupNode(FDR);
    const title = node.children[0] as HTMLElement;
    expect(title.textContent).toBe("FDR Skatepark");
    expect(title.className).toBe("map-popup__title");
  });

  it("location combines city + state with a comma", () => {
    const node = buildPopupNode(FDR);
    const loc = node.children[1] as HTMLElement;
    expect(loc.textContent).toBe("Philadelphia, PA");
  });

  it("link href targets /park/<slug>", () => {
    const node = buildPopupNode(FDR);
    const link = node.children[2] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/park/fdr");
    expect(link.textContent).toContain("View profile");
  });

  it("XSS-safety: a name with HTML-like characters renders as literal text", () => {
    const evil = {
      slug: "evil",
      name: "<script>alert('xss')</script>Bad Park",
      city: "Hackerville",
      state: "PA",
    };
    const node = buildPopupNode(evil);
    const title = node.children[0] as HTMLElement;
    // textContent shows the raw string; querySelector('script') finds nothing
    // because no <script> child was created — that's the whole point.
    expect(title.textContent).toBe("<script>alert('xss')</script>Bad Park");
    expect(node.querySelector("script")).toBeNull();
  });

  it("XSS-safety: a slug needing URL-encoding is encoded in the href", () => {
    const node = buildPopupNode({ ...FDR, slug: "weird slug/with stuff" });
    const link = node.children[2] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/park/weird%20slug%2Fwith%20stuff",
    );
  });

  it("XSS-safety: a city with HTML-like chars renders as literal text", () => {
    const node = buildPopupNode({
      ...FDR,
      city: '<img src=x onerror=alert(1)>',
    });
    const loc = node.children[1] as HTMLElement;
    expect(loc.textContent).toContain("<img");
    expect(node.querySelector("img")).toBeNull();
  });
});
