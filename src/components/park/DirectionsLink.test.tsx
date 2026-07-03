import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("DirectionsLink", () => {
  it("defaults to Google Maps (Android, desktop, or before hydration)", () => {
    setUserAgent(ANDROID_UA);
    render(
      <DirectionsLink
        parkName="FDR Skatepark"
        lat={39.9}
        lng={-75.19}
        fullAddress="1500 Pattison Ave"
      />,
    );
    const link = screen.getByRole("link", { name: /get directions/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=39.9,-75.19",
    );
  });

  it("swaps to Apple Maps on an iPhone", async () => {
    setUserAgent(IPHONE_UA);
    render(
      <DirectionsLink
        parkName="FDR Skatepark"
        lat={39.9}
        lng={-75.19}
        fullAddress="1500 Pattison Ave"
      />,
    );
    const link = await screen.findByRole("link", { name: /get directions/i });
    expect(link).toHaveAttribute(
      "href",
      "https://maps.apple.com/?q=FDR%20Skatepark&ll=39.9,-75.19",
    );
  });
});
