import { test, expect } from "@playwright/test";

// Phase 9 — middleware.ts returns HTTP 410 Gone for /builder/* and /shop/*
// (locked D3 + 6A). Body contains an SEO-friendly message + links back to
// / and /map/ so Google de-indexes faster than a bare 410.
//
// Sample 4 builders + 4 shops + 1 unknown each, plus bare /builder and /shop.

const KNOWN_BUILDER_SLUGS = [
  "spohn-ranch-skateparks",
  "grindline-skateparks",
  "diy",
  "5th-pocket-skateparks",
];

const KNOWN_SHOP_SLUGS = [
  "nocturnal",
  "zembo-temple-of-skate-design",
  "radio-skateshop",
  "exist-skate-shop",
];

test.describe("Phase 9 — middleware 410 Gone for retired URLs", () => {
  for (const slug of KNOWN_BUILDER_SLUGS) {
    test(`/builder/${slug} returns 410 with body`, async ({ page }) => {
      const response = await page.goto(`/builder/${slug}`);
      expect(response?.status()).toBe(410);
      await expect(
        page.getByRole("heading", { name: /permanently gone/i }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /browse parks/i })).toHaveAttribute(
        "href",
        "/",
      );
      await expect(page.getByRole("link", { name: /open the map/i })).toHaveAttribute(
        "href",
        "/map",
      );
    });
  }

  for (const slug of KNOWN_SHOP_SLUGS) {
    test(`/shop/${slug} returns 410 with body`, async ({ page }) => {
      const response = await page.goto(`/shop/${slug}`);
      expect(response?.status()).toBe(410);
      await expect(
        page.getByRole("heading", { name: /permanently gone/i }),
      ).toBeVisible();
    });
  }

  test("unknown /builder/<slug> also returns 410 (entire post type is retired)", async ({
    page,
  }) => {
    const response = await page.goto("/builder/some-future-unknown-slug");
    expect(response?.status()).toBe(410);
  });

  test("unknown /shop/<slug> also returns 410", async ({ page }) => {
    const response = await page.goto("/shop/another-unknown");
    expect(response?.status()).toBe(410);
  });

  test("bare /builder returns 410", async ({ page }) => {
    const response = await page.goto("/builder");
    expect(response?.status()).toBe(410);
  });

  test("bare /shop returns 410", async ({ page }) => {
    const response = await page.goto("/shop");
    expect(response?.status()).toBe(410);
  });

  test("410 response sets X-Robots-Tag to noindex,nofollow", async ({ request }) => {
    const response = await request.get("/builder/diy");
    expect(response.status()).toBe(410);
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  });
});

test.describe("Phase 9 — middleware does NOT intercept other paths", () => {
  test("/park/<slug> still resolves normally", async ({ page }) => {
    // Use a slug we know exists (FDR was seeded phase 3 + migrated phase 5).
    const response = await page.goto("/park/fdr");
    expect(response?.status()).toBe(200);
  });

  test("/county/<slug> still resolves normally (phase 8 regression guard)", async ({
    page,
  }) => {
    const response = await page.goto("/county/philadelphia");
    expect(response?.status()).toBe(200);
  });

  test("/obstacle/<slug> still resolves normally (phase 8 regression guard)", async ({
    page,
  }) => {
    const response = await page.goto("/obstacle/quarter-pipe");
    expect(response?.status()).toBe(200);
  });
});

test.describe("Phase 9 — /admin/* auth gate", () => {
  test("/admin/lint without cookie redirects to /admin/login", async ({ page }) => {
    const response = await page.goto("/admin/lint");
    // After redirect, URL should be /admin/login (final URL after following).
    expect(page.url()).toMatch(/\/admin\/login$/);
    // Status is either 200 (after follow) or 302 (intercepted).
    expect([200, 302]).toContain(response?.status() ?? 0);
  });

  test("/admin/login renders the login form", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: /admin login/i })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("/admin/login with wrong password shows the error message", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel(/password/i).fill("definitely-wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/incorrect password/i)).toBeVisible({ timeout: 5_000 });
  });
});
