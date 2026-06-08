import { expect, test } from "@playwright/test";

// Phase 7 plan-eng-review test decision 3A + Codex C9 — Playwright /map/
// coverage. Pin count is asserted against the SSR sr-only fallback list
// count (data-coupled but to the same source as the markers) rather than
// a hardcoded number, so the test survives stub authoring.

test.describe("/map/ — Leaflet map of open PA skateparks", () => {
  test("renders the fallback list with at least one park link", async ({ page }) => {
    await page.goto("/map/");
    // The h1 is sr-only but present in the DOM.
    await expect(page.getByRole("heading", { level: 1, name: /pennsylvania skateparks map/i })).toHaveCount(1);
    const fallback = page.getByRole("list", { name: /all pennsylvania skateparks/i });
    await expect(fallback).toBeVisible();
    const links = fallback.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("MapView mounts: document.body[data-map-mounted='true'] after JS runs (CMT-3 signal)", async ({ page }) => {
    await page.goto("/map/");
    // Wait for the client island to mount. The data attribute is the canonical
    // signal — it flips the fallback list to sr-only.
    await expect(page.locator("body[data-map-mounted='true']")).toHaveCount(1);
  });

  test("at least one Leaflet marker is rendered after mount", async ({ page }) => {
    await page.goto("/map/");
    // Leaflet markers carry the .leaflet-marker-icon class. With clustering
    // (D12), the rendered count at default zoom is < total parks because
    // dense areas collapse into cluster badges — assert >= 1 instead.
    await page.locator(".leaflet-marker-icon, .leaflet-marker-cluster").first().waitFor({ timeout: 10_000 });
    const markerCount = await page.locator(".leaflet-marker-icon, .leaflet-marker-cluster").count();
    expect(markerCount).toBeGreaterThan(0);
  });

  test("tapping a pin shows a popup with a /park/<slug> link", async ({ page }) => {
    await page.goto("/map/");
    // Wait for any marker/cluster to render so we know Leaflet is mounted.
    await page
      .locator(".leaflet-marker-icon, .leaflet-marker-cluster")
      .first()
      .waitFor({ timeout: 10_000 });
    // At PA-wide fitBounds zoom on mobile (Pixel 7 = 412px wide), every pin
    // may be inside a cluster. Force a closer zoom via Leaflet's zoom-in
    // control. page.evaluate dispatches 4 synchronous DOM clicks; Leaflet
    // coalesces and resolves to ~4 zoom levels in flight before we poll
    // for individual markers.
    await page.evaluate(() => {
      const zoomIn = document.querySelector(".leaflet-control-zoom-in") as HTMLAnchorElement | null;
      if (!zoomIn) throw new Error("no .leaflet-control-zoom-in control");
      for (let i = 0; i < 4; i++) zoomIn.click();
    });
    // After zoom, individual markers should be visible.
    await page.locator(".leaflet-marker-icon").first().waitFor({ timeout: 5_000 });
    await page.locator(".leaflet-marker-icon").first().click();
    const popup = page.locator(".map-popup");
    await expect(popup).toBeVisible({ timeout: 5_000 });
    const link = popup.getByRole("link");
    await expect(link).toHaveAttribute("href", /^\/park\/[a-z0-9-]+$/i);
  });

  test("Find-me button: granted location triggers map flyTo", async ({ page, context, browserName }) => {
    test.skip(browserName === "firefox", "geolocation context API behaves differently on Firefox in CI");
    // Grant geolocation for the baseURL origin BEFORE the first navigation;
    // some browsers attach permissions per-origin at request time.
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:3000" });
    await context.setGeolocation({ latitude: 40.45, longitude: -79.99 }); // Pittsburgh-ish
    await page.goto("/map/");
    const findMe = page.getByRole("button", { name: /find parks near me/i });
    await expect(findMe).toBeVisible({ timeout: 10_000 });
    await findMe.click();
    // After flyTo the URL doesn't change; the map.flyTo animation is opaque
    // from outside Leaflet. Smoke-assert: button doesn't end up stuck in a
    // visible error state.
    await expect(page.getByRole("button", { name: /couldn't get location|location unavailable/i })).toHaveCount(0);
  });
});
