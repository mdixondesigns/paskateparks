import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";

import { DirectionsLink } from "./DirectionsLink";

function setUserAgent(ua: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1";
const DESKTOP_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

const PARK = {
  parkName: "FDR Skatepark",
  lat: 39.9,
  lng: -75.19,
  fullAddress: "1500 Pattison Ave",
};
const GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&destination=39.9,-75.19";

function renderLink() {
  render(<DirectionsLink {...PARK} />);
  return screen.getByRole("link", { name: /get directions/i });
}

describe("DirectionsLink", () => {
  it("opens Apple Maps with the park name and coordinates on an iPhone", () => {
    setUserAgent(IPHONE_UA);
    const href = renderLink().getAttribute("href") ?? "";
    const url = new URL(href);

    expect(url.host).toBe("maps.apple.com");
    expect(url.searchParams.get("q")).toBe(PARK.parkName);
    expect(href).toContain(encodeURIComponent(PARK.parkName));
    expect(url.searchParams.get("ll")).toBe("39.9,-75.19");
    expect(href).not.toContain("google.com");
  });

  it.each([
    ["Android phone", ANDROID_UA],
    ["desktop Chrome", DESKTOP_CHROME_UA],
    ["iPad", IPAD_UA],
    ["desktop Safari", DESKTOP_SAFARI_UA],
  ])("opens Google Maps with coordinates on %s", (_label, ua) => {
    setUserAgent(ua);
    const link = renderLink();

    expect(link).toHaveAttribute("href", GOOGLE_URL);
    const href = link.getAttribute("href") ?? "";
    expect(href).not.toContain("maps.apple.com");
    expect(href).not.toContain(encodeURIComponent(PARK.parkName));
  });

  it("server-renders the Google Maps link even for an iPhone user agent", () => {
    // A naive `navigator.userAgent` read during render would produce Apple Maps.
    setUserAgent(IPHONE_UA);
    const html = renderToString(<DirectionsLink {...PARK} />);

    expect(html).toContain(`href="${GOOGLE_URL.replace(/&/g, "&amp;")}"`);
    expect(html).not.toContain("maps.apple.com");
  });

  it("hydrates server HTML without a mismatch, then swaps to Apple Maps on an iPhone", async () => {
    setUserAgent(IPHONE_UA);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DirectionsLink {...PARK} />);
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, <DirectionsLink {...PARK} />);
      });

      expect(errorSpy).not.toHaveBeenCalled();
      const href = container.querySelector("a")?.getAttribute("href") ?? "";
      expect(new URL(href).host).toBe("maps.apple.com");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
