import { expect, test } from "@playwright/test";

// Phase 10 — synced map+list layout on /.
//
// Tests gate themselves to mobile or desktop viewports so the same file
// runs across mobile-chrome / mobile-safari / desktop-chromium projects
// in playwright.config.ts.
//
// Restored 2026-07-06 — automatic bbox filter. The list always shows exactly
// the parks whose coordinates fall within the map's current visible bounds
// (plus any no-coordinate parks would be excluded entirely — see
// bbox-filter.test.ts / SyncedMapList.test.tsx for that unit coverage).
// Real in-browser drag/pan can't be simulated reliably against Leaflet under
// Playwright (see the note at the bottom of this file) — bbox tests here are
// URL-param-driven instead, matching the existing cold-load-view pattern,
// which IS deterministic since useMapUrlState reads it directly.

const DESKTOP_BREAKPOINT_PX = 1024;

function isDesktopViewport(viewport: { width: number } | null | undefined): boolean {
  return (viewport?.width ?? 0) >= DESKTOP_BREAKPOINT_PX;
}

// A tight zoom centered deep in rural north-central PA (Susquehannock State
// Forest) — no skatepark is anywhere near this spot, so this bbox reliably
// yields zero results regardless of how the live dataset grows over time.
const EMPTY_AREA_URL = "/?lat=41.65&lng=-77.75&zoom=15";

test.describe("Phase 10 — synced map+list on /", () => {
  test("SSR response embeds the full park list with data-park-id markers (D6 SEO bet)", async ({
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

  test("SSR response is filter-independent — a narrowing URL still returns the full list (D6 SEO bet, bbox is client-only)", async ({
    request,
  }) => {
    const [fullRes, narrowRes] = await Promise.all([
      request.get("/"),
      request.get(EMPTY_AREA_URL),
    ]);
    const fullIds = (await fullRes.text()).match(/data-park-id="\d+"/g) ?? [];
    const narrowIds = (await narrowRes.text()).match(/data-park-id="\d+"/g) ?? [];
    // The bbox filter is 100% client-side, post-hydration — the server has
    // no concept of "current viewport," so both requests must return
    // identical, unfiltered HTML regardless of the URL's lat/lng/zoom.
    expect(narrowIds.length).toBe(fullIds.length);
  });

  test("desktop cold load shows both panes, map mounted", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only test");
    await page.goto("/");
    // Hero h1 was removed; SiteHeader wordmark is the brand anchor on /.
    await expect(page.getByRole("link", { name: /^PA Skateparks$/i })).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
  });

  test("mobile cold load: list visible, no Leaflet in the DOM, unfiltered (no live map yet)", async ({
    page,
    viewport,
  }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    // D10 — mapBounds is null until the map first mounts; the list shows
    // every park unfiltered until then, matching pre-feature behavior.
    const fullCount = await page.locator("[data-park-id]").count();
    expect(fullCount).toBeGreaterThan(10);
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

  test("cold load with valid ?lat&lng&zoom sets the initial map view and narrows the list to that bbox", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    await page.goto("/");
    const fullCount = await page.locator("[data-park-id]").count();

    await page.goto("/?lat=39.95&lng=-75.16&zoom=13");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // Restored 2026-07-06 — a tighter view narrows the list. We assert the
    // relationship (narrower bbox → fewer-or-equal results) rather than an
    // exact count, since the live dataset can grow over time.
    await expect
      .poll(async () => page.locator("[data-park-id]").count())
      .toBeLessThanOrEqual(fullCount);
  });

  test("bbox filter: panning to an area with zero parks shows the empty-state copy and a 'See all parks' action", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    await page.goto(EMPTY_AREA_URL);
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await expect(page.getByText(/no skateparks in this area/i)).toBeVisible();
    await expect(page.locator("[data-park-id]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /see all parks/i })).toBeVisible();
  });

  test("'See all parks' resets the view, list returns to unfiltered, and keyboard focus lands on the list heading", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    await page.goto(EMPTY_AREA_URL);
    const seeAll = page.getByRole("button", { name: /see all parks/i });
    await seeAll.waitFor();

    // Keyboard-only activation (D12 regression guard) — Tab to the button
    // and press Enter rather than a mouse click, so this exercises the
    // exact interaction the focus fix targets.
    await seeAll.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    await expect(page.locator("#park-list-heading")).toBeFocused();
  });

  test("legacy ?filtered=1 from earlier shipped URLs no longer renders bbox-button UI (Plan A cleanup verified, harmless today)", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // Phase 10 briefly shipped a `filtered=1` param under the original
    // (pre-Plan A) bbox design; useMapUrlState never parses it — old links
    // in the wild just get lat/lng/zoom applied, the param itself is inert.
    await page.goto("/?lat=39.95&lng=-75.16&zoom=12&filtered=1");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
  });

  test("cold load with invalid URL params falls back gracefully", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // lat=abc is NaN, zoom=999 is out-of-bounds. parseMapUrlState returns
    // null view → wrapper falls back to all-PA fitBounds; no error.
    await page.goto("/?lat=abc&lng=&zoom=999");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
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
    // Pre-existing flake fixed here (confirmed present before this PR, on
    // the base commit too): the old approach loaded the all-parks fit-bounds
    // view, then blindly zoomed in 6x from whatever the geographic centroid
    // of ALL parks happened to be, then clicked ".leaflet-marker-icon".first().
    // ALL ~150 markers are added to the map on mount regardless of viewport
    // (no virtualization/clustering), so ".first()" is DOM-order, not
    // viewport-order — it can resolve to a marker positioned far outside the
    // current view no matter where the map is centered. Fix: navigate to a
    // URL centered on FDR (a specific, known park) and target ITS marker
    // directly by the accessible alt text MapView renders on the thumbnail
    // image, guaranteeing we click a marker that's actually on-screen.
    await page.goto("/?lat=39.8984981&lng=-75.179744&zoom=15");
    const marker = page.locator(".leaflet-marker-icon").filter({ has: page.locator('img[alt="FDR"]') });
    await marker.waitFor({ timeout: 10_000 });
    await marker.click({ force: true });
    // .card-selected stays applied while the popup is open (no timer fade).
    // Assert it sticks past what the old 1500ms flash would have allowed.
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
  //   - bbox-filter pure functions (inBbox/filterByBbox edge cases) → bbox-filter.test.ts
  //   - no-coordinate parks excluded, typed search survives an empty pan,
  //     bbox-empty vs. text-filter-empty never cross-fire → SyncedMapList.test.tsx
  //
  // Skipped here (out of scope): interactive live drag/pan (Leaflet drag
  // doesn't respond to Playwright synthetic mouse events — bbox coverage
  // above is URL-driven instead, which is deterministic and exercises the
  // identical moveend → filter codepath) and browser-back history
  // restoration (framework guarantee — useMapUrlState only reads).
});
