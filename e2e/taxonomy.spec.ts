import { expect, test } from "@playwright/test";

// Phase 8 plan-eng-review T8 — taxonomy archive routes (/county/[slug] and
// /obstacle/[slug]) plus the legacy WP URL 301 chains.
//
// Coverage from CMT-5A:
//   • Happy: /county/bucks renders, contains the count + a park link
//   • 404:   /county/foo and /obstacle/foo return 404 cheaply (dynamicParams=false)
//   • Metadata: <title> + canonical link + JSON-LD ItemList + breadcrumb
//   • Redirects: 4 WP URL shapes 301 to the new shape
//
// Note on 2-hop redirects: with `trailingSlash: false` (Next default), an
// incoming /regions_and_counties/bucks/ first gets its trailing slash
// stripped by Next's built-in normalization (308 → /regions_and_counties/
// bucks), THEN our user redirect fires (308 → /county/bucks). The tests
// follow redirects to the final URL — both 1-hop (no-slash) and 2-hop
// (with-slash) end at the same destination.

test.describe("County archive — /county/[slug]", () => {
  test("happy path: /county/bucks renders title, count, and park links", async ({
    page,
  }) => {
    const response = await page.goto("/county/bucks");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: /Skateparks in Bucks County, PA/i }),
    ).toBeVisible();

    // Intro paragraph mentions count + "Bucks County, Pennsylvania"
    await expect(page.getByText(/open skateparks? in Bucks County, Pennsylvania/i)).toBeVisible();

    // At least one park link — Bensalem Township Community Park is in the seeded data.
    await expect(
      page.locator("a[href^='/park/']").first(),
    ).toBeVisible();
  });

  test("unknown slug returns 404 (dynamicParams=false short-circuit)", async ({
    page,
  }) => {
    const response = await page.goto("/county/foo-bar");
    expect(response?.status()).toBe(404);
  });

  test("breadcrumb links back to home", async ({ page }) => {
    await page.goto("/county/bucks");
    const breadcrumbHome = page
      .getByRole("navigation", { name: /breadcrumb/i })
      .getByRole("link", { name: /Pennsylvania Skateparks/i });
    await expect(breadcrumbHome).toBeVisible();
    expect(await breadcrumbHome.getAttribute("href")).toBe("/");
  });

  test("metadata + canonical + JSON-LD present", async ({ page }) => {
    await page.goto("/county/bucks");

    await expect(page).toHaveTitle(/Skateparks in Bucks County, PA — PA Skateparks/);

    const canonical = page.locator("link[rel='canonical']");
    await expect(canonical).toHaveAttribute(
      "href",
      /\/county\/bucks$/,
    );

    // Two JSON-LD blocks — ItemList + BreadcrumbList
    const ldScripts = page.locator("script[type='application/ld+json']");
    await expect(ldScripts).toHaveCount(2);

    // ItemList must mention "Bucks County"
    const ldContent = await ldScripts.allTextContents();
    const combined = ldContent.join("\n");
    expect(combined).toContain("ItemList");
    expect(combined).toContain("BreadcrumbList");
    expect(combined).toContain("Bucks County");
  });
});

test.describe("Obstacle archive — /obstacle/[slug]", () => {
  test("happy path: /obstacle/quarter-pipe renders title and park links", async ({
    page,
  }) => {
    const response = await page.goto("/obstacle/quarter-pipe");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: /Quarter Pipe Spots in PA Skateparks/i }),
    ).toBeVisible();

    await expect(
      page.getByText(/Pennsylvania skateparks? with quarter pipe obstacles/i),
    ).toBeVisible();

    await expect(page.locator("a[href^='/park/']").first()).toBeVisible();
  });

  test("unknown slug returns 404", async ({ page }) => {
    const response = await page.goto("/obstacle/foo-bar");
    expect(response?.status()).toBe(404);
  });

  test("underscore form is rejected (URLs use hyphens)", async ({ page }) => {
    // Verifies CMT-1A — obstacleForSlug rejects the underscore enum form,
    // dynamicParams=false then 404s rather than rendering the page.
    const response = await page.goto("/obstacle/quarter_pipe");
    expect(response?.status()).toBe(404);
  });

  test("metadata + canonical + JSON-LD present", async ({ page }) => {
    await page.goto("/obstacle/quarter-pipe");

    await expect(page).toHaveTitle(/Quarter Pipe Spots — PA Skateparks/);

    const canonical = page.locator("link[rel='canonical']");
    await expect(canonical).toHaveAttribute(
      "href",
      /\/obstacle\/quarter-pipe$/,
    );

    const ldScripts = page.locator("script[type='application/ld+json']");
    await expect(ldScripts).toHaveCount(2);

    const combined = (await ldScripts.allTextContents()).join("\n");
    expect(combined).toContain("ItemList");
    expect(combined).toContain("Quarter Pipe");
  });
});

test.describe("Legacy WP URL 301 chains (T7 + CMT-2A)", () => {
  // page.goto follows redirects by default and reports the final response.
  // We assert the final URL + status, not the intermediate hops, because
  // Next's built-in trailingSlash strip may add an extra hop in the with-
  // slash variants (see file header).

  test("/regions_and_counties/bucks → /county/bucks (no slash, single hop)", async ({
    page,
  }) => {
    const response = await page.goto("/regions_and_counties/bucks");
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/\/county\/bucks$/);
  });

  test("/regions_and_counties/bucks/ → /county/bucks (with slash, may chain)", async ({
    page,
  }) => {
    const response = await page.goto("/regions_and_counties/bucks/");
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/\/county\/bucks$/);
  });

  test("/park_obstacles/quarter-pipe → /obstacle/quarter-pipe (no slash)", async ({
    page,
  }) => {
    const response = await page.goto("/park_obstacles/quarter-pipe");
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/\/obstacle\/quarter-pipe$/);
  });

  test("/park_obstacles/quarter-pipe/ → /obstacle/quarter-pipe (with slash)", async ({
    page,
  }) => {
    const response = await page.goto("/park_obstacles/quarter-pipe/");
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/\/obstacle\/quarter-pipe$/);
  });

  test("legacy redirects are permanent (308 — semantically equivalent to 301 for browsers)", async ({
    request,
  }) => {
    // Use the request API to inspect redirect status codes directly.
    // Next emits 308 (Permanent Redirect) — browsers + Google treat 308 the
    // same as 301 for SEO equity transfer.
    const response = await request.get("/regions_and_counties/bucks", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/county/bucks");
  });
});
