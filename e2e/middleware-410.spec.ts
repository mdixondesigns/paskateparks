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

  // Regression guard for the full login -> cookie -> /admin/lint round-trip.
  // Pre-2026-06-15 this was only exercised by humans; a Vercel deploy-window
  // glitch surfaced the missing coverage. The chain is sign() in the server
  // action, Set-Cookie on the 303, browser stores it, follows the redirect
  // to /admin/lint, proxy.ts middleware calls verify(), accepts, page renders.
  test("/admin/login with right password lands on /admin/lint", async ({
    page,
  }, testInfo) => {
    // Login flow is browser-agnostic (HTML form + middleware HMAC verify, no
    // browser-specific JS). Running on all 3 projects in parallel against
    // pnpm dev causes Turbopack compile contention that pushes any single
    // run past 30s. Pin to desktop-chromium — CI runs `pnpm start` on a
    // pre-built bundle and would pass on any project, but keeping this on
    // one project locally keeps the suite fast and deterministic.
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Login flow is browser-agnostic; covered on desktop-chromium only.",
    );

    const password = process.env.ADMIN_PASSWORD;
    test.skip(!password, "ADMIN_PASSWORD not loaded — check playwright.config dotenv");

    await page.goto("/admin/login");
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();

    // 1s constant-time delay in loginAction + Turbopack first-compile
    // of /admin/lint when running against pnpm dev.
    await page.waitForURL(/\/admin\/lint$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^data lint$/i })).toBeVisible();
  });
});
