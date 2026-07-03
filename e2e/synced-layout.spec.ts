import { expect, test } from "@playwright/test";

// Phase 10 — synced map+list layout on /.
//
// Tests gate themselves to mobile or desktop viewports so the same file
// runs across mobile-chrome / mobile-safari / desktop-chromium projects
// in playwright.config.ts.
//
// Plan A: no bbox filter, no "Search this area" — the list re-orders by
// map center as the user pans. Marker click → matching list card gets a
// persistent .card-selected highlight that stays until the popup is
// dismissed (no auto-scroll — removed per user request so the list doesn't
// jump when a marker is clicked).

const DESKTOP_BREAKPOINT_PX = 1024;

function isDesktopViewport(viewport: { width: number } | null | undefined): boolean {
  return (viewport?.width ?? 0) >= DESKTOP_BREAKPOINT_PX;
}

test.describe("Phase 10 — synced map+list on /", () => {
  test("SSR response embeds the park list with data-park-id markers (D6 SEO bet)", async ({
    request,
  }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    const ids = html.match(/data-park-id="\d+"/g) ?? [];
    expect(ids.length).toBeGreaterThan(10);
    // Wordmark + footer copy keep the full "Pennsylvania Skateparks" string
    // in the rendered HTML even though the visible header reads "PA Skateparks".
    expect(html).toContain("PA Skateparks");
  });

  test("desktop cold load shows both panes, map mounted", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only test");
    await page.goto("/");
    // Hero h1 was removed; SiteHeader wordmark is the brand anchor on /.
    await expect(page.getByRole("link", { name: /^PA Skateparks$/i })).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
  });

  test("mobile cold load: list visible, no Leaflet in the DOM", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
  });

  test("mobile Map pill opens overlay, Leaflet mounts on demand", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    await page.getByRole("button", { name: /^map$/i }).click();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /close map/i })).toBeVisible();
  });

  test("mobile close X hides the overlay but keeps MapView mounted", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await page.getByRole("button", { name: /^map$/i }).click();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await page.getByRole("button", { name: /close map/i }).click();
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^map$/i })).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
  });

  test("cold load with valid ?lat&lng&zoom sets the initial map view", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    await page.goto("/?lat=39.95&lng=-75.16&zoom=12");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // No "Search this area" button — Plan A removed bbox filtering.
    await expect(page.getByRole("button", { name: /search this area/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /see all/i })).toHaveCount(0);
  });

  test("cold load with invalid URL params falls back gracefully", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // lat=abc is NaN, zoom=999 is out-of-bounds. parseMapUrlState returns
    // null view → wrapper falls back to all-PA fitBounds; no error.
    await page.goto("/?lat=abc&lng=&zoom=999");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
  });

  test("legacy ?filtered=1 from earlier shipped URLs no longer renders bbox UI", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // Phase 10 briefly shipped a `filtered=1` param. Old links in the wild
    // shouldn't break — we just ignore the param (lat/lng/zoom still apply).
    await page.goto("/?lat=39.95&lng=-75.16&zoom=12&filtered=1");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /see all/i })).toHaveCount(0);
  });

  test("/map → / 301 redirect (T9)", async ({ page, request }) => {
    const res = await request.get("/map", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"]).toMatch(/^\/(?:\?.*)?$/);
    await page.goto("/map");
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  test("clicking a marker highlights the matching list card persistently", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only test (mobile overlay covers list)");
    await page.goto("/");
    await page
      .locator(".leaflet-marker-icon, .leaflet-marker-cluster")
      .first()
      .waitFor({ timeout: 10_000 });
    // Zoom in to surface individual markers (not clusters).
    await page.evaluate(() => {
      const zoomIn = document.querySelector(".leaflet-control-zoom-in") as HTMLAnchorElement | null;
      if (!zoomIn) throw new Error("no .leaflet-control-zoom-in");
      for (let i = 0; i < 6; i++) zoomIn.click();
    });
    await page.locator(".leaflet-marker-icon").first().waitFor({ timeout: 5_000 });
    await page.locator(".leaflet-marker-icon").first().click();
    // Per Plan A: .card-selected stays applied while the popup is open
    // (no timer fade). Assert it sticks past what the old 1500ms flash
    // would have allowed.
    await expect(page.locator("[data-park-id].card-selected")).toHaveCount(1, {
      timeout: 2_000,
    });
    await page.waitForTimeout(2_000);
    await expect(page.locator("[data-park-id].card-selected")).toHaveCount(1);
  });

  // Unit-level concerns covered elsewhere:
  //   - data-park-id rendering for /park/[slug] callers → NearbyCard.test.tsx
  //   - userLocation/mapCenter sort precedence → HomeParkList.test.tsx
  //   - popup events + hoveredParkId → MapView.test.tsx
  //
  // Skipped here (out of scope for Plan A): interactive pan (Leaflet drag
  // doesn't respond to Playwright synthetic events) and browser-back
  // history restoration (framework guarantee — useMapUrlState only reads).
});
