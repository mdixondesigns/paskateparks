import { expect, test } from "@playwright/test";

// Park-detail intercept modal — covers the 16 cases from
// docs/designs/park-modal.md §Test plan additions plus 2 added in eng review
// (D5 router.back fallback, D6 modifier-click bypass).
//
// Runs across the three projects in playwright.config.ts:
//   mobile-chrome, mobile-safari, desktop-chromium.
// Tests gate via the viewport width when they're mobile- or desktop-specific.

const DESKTOP_BREAKPOINT_PX = 1024;

function isDesktopViewport(viewport: { width: number } | null | undefined): boolean {
  return (viewport?.width ?? 0) >= DESKTOP_BREAKPOINT_PX;
}

// Resolve the first list card on the homepage that has a real /park/<slug>
// href. Used to drive intercept-route clicks consistently across runs even
// as the list sort changes.
async function getFirstParkLink(page: import("@playwright/test").Page) {
  const link = page
    .locator('[data-park-id] a[href^="/park/"]')
    .first();
  await link.waitFor({ state: "visible" });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("first park link has no href");
  const slug = href.replace(/^\/park\//, "");
  const parkId = await link
    .locator("xpath=ancestor::*[@data-park-id][1]")
    .getAttribute("data-park-id");
  return { link, href, slug, parkId };
}

test.describe("park-modal — intercepting parallel route", () => {
  test("click list card on / → modal opens, URL is /park/<slug>, homepage stays mounted", async ({
    page,
  }) => {
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Modal dialog is open.
    const dialog = page.locator("dialog.park-modal");
    await expect(dialog).toHaveAttribute("open", "");
    // Homepage's list still mounted underneath (SyncedMapList wrapper).
    await expect(page.locator("[data-park-id]").first()).toBeAttached();
  });

  test("press ESC → modal closes, URL returns to /", async ({ page }) => {
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Native <dialog>.showModal() puts focus on a child of the dialog, but
    // after an intercept-route mount the link that was just clicked may
    // still hold focus (the streamed RSC render happens after the click).
    // Explicitly focus the modal so the ESC keydown reaches it.
    await page.locator("dialog.park-modal").focus();
    await page.keyboard.press("Escape");
    await page.waitForURL("/");
    await expect(page.locator("dialog.park-modal")).toHaveCount(0);
  });

  test("click X close button → modal closes (desktop)", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "X button is desktop-only");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Scope to the modal so the Leaflet popup's "Close popup" doesn't clash.
    await page.locator(".park-modal .park-modal__close-x").click();
    await page.waitForURL("/");
  });

  test("click mobile back arrow → modal closes (mobile)", async ({ page, viewport }) => {
    test.skip(isDesktopViewport(viewport), "back arrow is mobile-only");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL("/");
  });

  test("browser back closes the modal (intercept history regression)", async ({ page }) => {
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await page.goBack();
    await page.waitForURL("/");
    await expect(page.locator("dialog.park-modal")).toHaveCount(0);
  });

  test("direct hit /park/<slug> → full standalone page (no modal in DOM)", async ({ page }) => {
    await page.goto("/park/fdr");
    await expect(page.getByRole("heading", { name: /fdr/i }).first()).toBeVisible();
    await expect(page.locator("dialog.park-modal")).toHaveCount(0);
    // Standalone page renders <main id="main">; intercept route does not.
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("mobile: card click renders full-screen modal with back arrow", async ({
    page,
    viewport,
  }) => {
    test.skip(isDesktopViewport(viewport), "mobile-only");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await expect(page.locator("dialog.park-modal")).toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    // Back arrow visible, X hidden (CSS gates them by breakpoint).
    await expect(page.getByRole("button", { name: "Close" })).toBeHidden();
  });

  test("desktop: backdrop click closes the modal", async ({ page, viewport }) => {
    test.skip(!isDesktopViewport(viewport), "backdrop click is desktop-only");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Native <dialog>.showModal() backdrop fires click events with
    // event.target === dialog. Dispatch synthetically so we don't have to
    // pick a viewport coordinate that's outside the centered max-w-2xl
    // dialog content (which is unreliable across screen sizes).
    await page.evaluate(() => {
      const dlg = document.querySelector("dialog.park-modal") as HTMLDialogElement;
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
      dlg.dispatchEvent(ev);
    });
    await page.waitForURL("/");
  });

  test("modal-open + click background → click does NOTHING (D6.1: background is inert)", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "background-inert check is desktop-only");
    await page.goto("/");
    const { link, href, parkId } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Try to click a different list card behind the modal — should be inert.
    const otherCard = page
      .locator(`[data-park-id]:not([data-park-id="${parkId}"]) a[href^="/park/"]`)
      .first();
    // Force the click (Playwright will refuse otherwise because the dialog
    // intercepts pointer events at the OS level); the test asserts that the
    // URL is unchanged after the attempt.
    await otherCard.click({ force: true }).catch(() => {});
    // URL should still be the original park modal.
    await expect(page).toHaveURL(href);
  });

  test(".card-selected: matching list card is highlighted while modal is open", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "list visible alongside modal on desktop only");
    await page.goto("/");
    const { link, href, parkId } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await expect(
      page.locator(`[data-park-id="${parkId}"].card-selected`),
    ).toHaveCount(1);
    // Close → highlight cleared.
    await page.locator("dialog.park-modal").focus();
    await page.keyboard.press("Escape");
    await page.waitForURL("/");
    await expect(
      page.locator(`[data-park-id="${parkId}"].card-selected`),
    ).toHaveCount(0);
  });

  test("map popup link click → modal opens (D6.2 router-aware popup)", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "map popup link only reachable on desktop");
    await page.goto("/");
    await expect(page.locator(".leaflet-container")).toHaveCount(1);
    // Zoom in so individual markers don't visually overlap.
    await page.evaluate(() => {
      const zoomIn = document.querySelector(
        ".leaflet-control-zoom-in",
      ) as HTMLAnchorElement | null;
      if (!zoomIn) return;
      for (let i = 0; i < 6; i++) zoomIn.click();
    });
    const marker = page.locator(".leaflet-marker-icon").first();
    await marker.waitFor({ timeout: 5_000 });
    // The marker's <img> child intercepts pointer-events for Leaflet's
    // accessibility hooks; force the click on the marker div itself.
    await marker.click({ force: true });
    const popupLink = page.locator(".map-popup__link").first();
    await expect(popupLink).toBeVisible();
    await popupLink.click();
    await expect(page.locator("dialog.park-modal")).toHaveAttribute("open", "");
    await expect(page).toHaveURL(/\/park\/.+/);
  });

  test("refresh while modal is open → lands on standalone /park/<slug>", async ({ page }) => {
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await page.reload();
    await page.waitForURL(href);
    // Intercept does NOT survive refresh — standalone <main> renders, no dialog.
    await expect(page.locator("dialog.park-modal")).toHaveCount(0);
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("invalid slug direct-hit → standalone 404 (modal not-found is unit-tested)", async ({
    page,
  }) => {
    // The intercept-route not-found panel is covered by ModalShell.test.tsx
    // (notFound prop). E2E-triggering the intercept with a bad slug requires
    // a Next <Link href="/park/__typo__"> on the homepage, which we don't
    // ship; injecting raw history.pushState bypasses Next's router and
    // doesn't fire the intercept. This test pins the standalone 404 path
    // that direct hits + crawlers/share links actually reach.
    const res = await page.goto("/park/__not_a_real_park__", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(404);
  });

  test("tab title reflects open park, reverts on close", async ({ page }) => {
    await page.goto("/");
    const homepageTitle = await page.title();
    expect(homepageTitle).toMatch(/pennsylvania skateparks/i);
    const { link } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(/\/park\//);
    // Title is updated client-side by ModalShell (parallel-slot
    // generateMetadata doesn't reach document.title in Next.js).
    await expect(page).toHaveTitle(/—\s*Pennsylvania Skateparks/, { timeout: 10_000 });
    await page.locator("dialog.park-modal").focus();
    await page.keyboard.press("Escape");
    await page.waitForURL("/");
    await expect(page).toHaveTitle(homepageTitle, { timeout: 10_000 });
  });

  test("D5 — router.push('/') fallback fires when window.history.length is 1", async ({
    page,
  }) => {
    // The deep-link → / → modal → close scenario from the plan ultimately
    // boils down to "no safe history entry to pop back to → router.push('/')
    // instead of router.back()". The branch is `window.history.length > 1`
    // in ModalShell. Inject the empty-history state deterministically and
    // assert the close path lands on /.
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    await page.evaluate(() => {
      Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    });
    await page.locator("dialog.park-modal").focus();
    await page.keyboard.press("Escape");
    await page.waitForURL("/");
    await expect(page).toHaveURL("/");
  });

  test("D6 — modifier-click on list card opens standalone in new tab", async ({
    page,
    context,
    viewport,
  }) => {
    // Mobile devices don't expose meta/ctrl keys natively; skip on mobile.
    test.skip(!isDesktopViewport(viewport), "modifier-click is a desktop affordance");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    const newPagePromise = context.waitForEvent("page");
    await link.click({ modifiers: ["Meta"] });
    const newPage = await newPagePromise;
    await newPage.waitForLoadState();
    await expect(newPage).toHaveURL(new RegExp(`\\${href}$`));
    // Original tab unchanged.
    await expect(page).toHaveURL("/");
    await expect(page.locator("dialog.park-modal")).toHaveCount(0);
  });

  test("nested ESC: SuggestEdit inside modal — ESC closes inner only", async ({
    page,
    viewport,
  }) => {
    test.skip(!isDesktopViewport(viewport), "nested ESC flow stable on desktop");
    await page.goto("/");
    const { link, href } = await getFirstParkLink(page);
    await link.click();
    await page.waitForURL(href);
    // Open Suggest-an-Edit. Button label varies — try common patterns.
    const suggestBtn = page.getByRole("button", { name: /suggest an edit|suggest edit/i }).first();
    await suggestBtn.click();
    const inner = page.locator('[role="dialog"][aria-labelledby="suggest-modal-title"]');
    await expect(inner).toBeVisible();
    // Press ESC — inner should close, outer (park modal) should stay open.
    await page.keyboard.press("Escape");
    await expect(inner).toHaveCount(0);
    await expect(page.locator("dialog.park-modal")).toHaveAttribute("open", "");
    await expect(page).toHaveURL(href);
    // Press ESC again — now outer closes.
    await page.keyboard.press("Escape");
    await page.waitForURL("/");
  });
});
