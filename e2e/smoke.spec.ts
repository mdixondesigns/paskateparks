import { test, expect } from "@playwright/test";

test.describe("Phase 1 scaffold — smoke", () => {
  test("homepage returns 200 with the placeholder heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: /Pennsylvania Skateparks/i }),
    ).toBeVisible();
  });

  test("skip-link is reachable via Tab and points to #main (A6)", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();
    expect(await skipLink.getAttribute("href")).toBe("#main");
  });
});
