import { expect, test } from "@playwright/test";

// Phase 10 — synced map+list layout on /.
//
// Covers T1-T9 end-to-end. Tests gate themselves to mobile or desktop
// viewports so the same file runs across mobile-chrome / mobile-safari /
// desktop-chromium projects in playwright.config.ts.
//
// Pan-driven flows (the "Search this area" button surfacing after a user
// pan) aren't exercised here — Playwright's synthetic mouse drag is
// unreliable against Leaflet's pointer-event handling. Instead, the
// bbox-filter code path is verified end-to-end via the cold-load
// `?lat&lng&zoom&filtered=1` URL test which triggers the same apply
// path on first moveend.

const DESKTOP_BREAKPOINT_PX = 1024;

function isDesktopViewport(viewport: { width: number } | null | undefined): boolean {
  return (viewport?.width ?? 0) >= DESKTOP_BREAKPOINT_PX;
}

test.describe("Phase 10 — synced map+list on /", () => {
  test("SSR response embeds the park list with data-park-id markers (D6 SEO bet)", async ({
    request,
  }) => {
    // Hit the raw HTML — no JS execution. The list must be in the response
    // body so Googlebot and no-JS clients see all parks.
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    const ids = html.match(/data-park-id="\d+"/g) ?? [];
    // 48 currently-open parks; assert a generous floor that survives stub
    // authoring (data-park-id is rendered for every list card).
    expect(ids.length).toBeGreaterThan(10);
    expect(html).toContain("Pennsylvania Skateparks");
  });

  test("desktop cold load shows both panes, map mounted", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only test");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /pennsylvania skateparks/i }).first()).toBeVisible();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // List pane visible (uses HomeParkList <ol>) — first card is in the DOM.
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
  });

  test("mobile cold load: list visible, no Leaflet in the DOM", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    // T8 lazy-mount: MapView isn't rendered until first tap.
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
  });

  test("mobile Map pill opens overlay, Leaflet mounts on demand", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    // The pill has accessible label "Map".
    await page.getByRole("button", { name: /^map$/i }).click();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // Close (X) button surfaces while overlay open.
    await expect(page.getByRole("button", { name: /close map/i })).toBeVisible();
  });

  test("mobile close X hides the overlay but keeps MapView mounted", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only test");
    await page.goto("/");
    await page.getByRole("button", { name: /^map$/i }).click();
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    await page.getByRole("button", { name: /close map/i }).click();
    // List visible again; pill returns.
    await expect(page.locator("[data-park-id]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^map$/i })).toBeVisible();
    // Per T8 contract: the map stays in the DOM so re-open is instant
    // (no Leaflet re-init). The overlay is hidden via class swap, not unmount.
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
  });

  test("cold load with valid ?lat&lng&zoom&filtered=1 applies bbox filter to list", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // Philly-ish view, narrow zoom. Cold loads with filtered=1 — the wrapper's
    // pendingUrlFilterRef catches the first moveend and applies the bbox.
    await page.goto("/?lat=39.95&lng=-75.16&zoom=12&filtered=1");
    // The bbox-filter status row shows "Showing N of M parks in this area."
    // OR the empty-state copy when no parks fall in bounds.
    await expect(
      page.getByText(
        /Showing \d+ of \d+ parks in this area\.|No parks in this area/i,
      ),
    ).toBeVisible({ timeout: 10_000 });
    // "See all" reset chip is present.
    await expect(page.getByRole("button", { name: /see all/i })).toBeVisible();
  });

  test("cold load with valid filter then See all resets the filter and drops filtered=1", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    await page.goto("/?lat=39.95&lng=-75.16&zoom=12&filtered=1");
    const seeAll = page.getByRole("button", { name: /see all/i });
    await expect(seeAll).toBeVisible({ timeout: 10_000 });
    await seeAll.click();
    // Filter status banner disappears.
    await expect(page.getByText(/in this area/i)).toHaveCount(0);
    // URL no longer carries filtered=1. (lat/lng/zoom may still be present
    // because handleSeeAll writes the URL with filtered=false.)
    await expect(page).toHaveURL((url) => !url.searchParams.has("filtered"));
  });

  test("cold load with invalid URL params falls back gracefully", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // lat=abc is NaN, zoom=999 is out-of-bounds. parseMapUrlState should
    // return null view → wrapper falls back to all-PA fitBounds; no error.
    await page.goto("/?lat=abc&lng=&zoom=999&filtered=1");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // No bbox filter should be applied because the view was invalid.
    await expect(page.getByText(/in this area/i)).toHaveCount(0);
  });

  test("empty bbox shows the no-parks-in-area copy", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only — map only loads on /");
    // Lake Erie corner — well off any PA park.
    await page.goto("/?lat=42.5&lng=-80.5&zoom=14&filtered=1");
    await expect(
      page.getByText(/No parks in this area — pan or zoom out to see more\./i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("/map → / 301 redirect (T9)", async ({ page, request }) => {
    // First check the raw status to confirm 301 (Next dev mode sometimes
    // emits 307 for redirects() before build — when running under CI we
    // hit the production bundle, when running locally we hit dev. Both
    // are valid permanent-redirect codes.)
    const res = await request.get("/map", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"]).toMatch(/^\/(?:\?.*)?$/);
    // End-to-end: navigation to /map lands at /.
    await page.goto("/map");
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  test("clicking a marker scrolls + flashes the matching list card", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "desktop-only test (mobile overlay covers list)");
    await page.goto("/");
    // Wait for Leaflet to settle.
    await page
      .locator(".leaflet-marker-icon, .leaflet-marker-cluster")
      .first()
      .waitFor({ timeout: 10_000 });
    // Zoom in until individual markers (not clusters) are visible.
    await page.evaluate(() => {
      const zoomIn = document.querySelector(".leaflet-control-zoom-in") as HTMLAnchorElement | null;
      if (!zoomIn) throw new Error("no .leaflet-control-zoom-in");
      for (let i = 0; i < 6; i++) zoomIn.click();
    });
    await page.locator(".leaflet-marker-icon").first().waitFor({ timeout: 5_000 });
    await page.locator(".leaflet-marker-icon").first().click();
    // Some [data-park-id] card now has .card-flash applied. The flash
    // lifetime is 1500ms — race the assertion against it.
    await expect(page.locator("[data-park-id].card-flash")).toHaveCount(1, { timeout: 2_000 });
  });

  // The remaining handoff items are covered elsewhere:
  //
  //   #13 (null-coord card: no data-park-id when id undefined) is a unit-
  //       level concern, covered by src/components/park/NearbyCard.test.tsx
  //       in the "T6: data-park-id click-sync opt-in" block. e2e duplication
  //       would add CI time without catching anything the unit test misses.
  //
  //   #14 (browser back restores previous view) tests next/navigation
  //       history restoration, which is a framework guarantee — useMapUrlState
  //       just reads searchParams. Skipping per ponytail: every line we
  //       don't test the framework is a line we don't have to maintain when
  //       the framework changes its history handling.
  //
  //   #5/#6 (interactive pan → "Search this area" surfaces) — Leaflet's drag
  //       handler doesn't respond reliably to Playwright's synthetic mouse
  //       events. The same bbox-apply code path is exercised by the cold-load
  //       URL test above. If we ever need real pan coverage, the path is
  //       page.evaluate into a window-exposed map handle — out of scope here.
});
