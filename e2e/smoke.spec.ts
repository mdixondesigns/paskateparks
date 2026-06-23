import { test, expect } from "@playwright/test";

test.describe("Phase 1 scaffold — smoke", () => {
  test("homepage returns 200 with the PA Skateparks wordmark in the nav", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    // Hero h1 was removed by user request; branding lives in the SiteHeader
    // wordmark link instead.
    await expect(
      page.getByRole("link", { name: /^PA Skateparks$/i }),
    ).toBeVisible();
  });

  test("skip-link is reachable via Tab and points to #main (A6)", async ({
    page,
    browserName,
  }) => {
    // WebKit (Safari, iOS Safari) only includes form controls in the Tab
    // cycle by default — links are skipped unless the user has enabled
    // "Keyboard navigation" in macOS System Settings → Keyboard. That's a
    // browser policy, not a site bug; a real Safari user with that setting on
    // WILL Tab through to this link. The Tab-key assertion only makes sense
    // on Chromium-derived engines, where Tab includes links unconditionally.
    // Latent since phase 7 when the mobile-safari Playwright project was added.
    test.skip(
      browserName === "webkit",
      "WebKit's default Tab cycle skips links — see comment for context.",
    );

    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();
    expect(await skipLink.getAttribute("href")).toBe("#main");
  });
});
