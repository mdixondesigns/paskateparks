import { test, expect, type Page } from "@playwright/test";

// User accounts v1 — flagship auth E2E (docs/designs/user-accounts-v1.md T5).
//
// Runs ONLY against the local Supabase stack (`supabase start`) with the dev
// server pointed at it, because it (a) reads confirmation emails from the
// local mail trap and (b) creates real users. Guarded by E2E_LOCAL_AUTH=1 so
// a plain `pnpm exec playwright test` against the production-backed dev
// server can never create prod users.
//
// To run:
//   supabase start
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key> \
//   pnpm dev   (or let playwright's webServer boot with those vars)
//   E2E_LOCAL_AUTH=1 pnpm exec playwright test e2e/auth.spec.ts
//
// Auth flows are browser-agnostic (HTML forms + server actions); run on
// desktop-chromium only, same rationale as the admin login spec.

const LOCAL_AUTH = process.env.E2E_LOCAL_AUTH === "1";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

test.describe("User accounts — signup, confirm, account, logout", () => {
  test.skip(!LOCAL_AUTH, "E2E_LOCAL_AUTH=1 + local Supabase stack required");

  test.beforeEach(({ browserName }, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "desktop-chromium",
      "Auth flows are browser-agnostic; covered on desktop-chromium only.",
    );
    void browserName;
  });

  // Each run gets unique emails so the suite is rerunnable without resets.
  const runId = Date.now().toString(36);

  async function latestConfirmLinkFor(email: string): Promise<string> {
    // Poll the mail trap for the confirmation email; the link targets OUR
    // /auth/confirm route with token_hash (CM6.5 template).
    for (let attempt = 0; attempt < 20; attempt++) {
      const list = await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}&limit=1`);
      const { messages } = (await list.json()) as { messages: Array<{ ID: string }> };
      const id = messages?.[0]?.ID;
      if (id) {
        const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`);
        const { HTML, Text } = (await msg.json()) as { HTML?: string; Text?: string };
        const match = (HTML ?? Text ?? "").match(/http:\/\/localhost:3000\/auth\/confirm[^"' )]+/);
        if (match) return match[0].replace(/&amp;/g, "&");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`No confirmation email arrived for ${email}`);
  }

  async function signUp(page: Page, email: string, name = "E2E Skater") {
    await page.goto("/login?mode=signup");
    await page.getByLabel(/display name/i).fill(name);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("e2e-pass-123");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  }

  test("FLAGSHIP: signup → emailed link → confirmed → edit name → sign out", async ({ page }) => {
    const email = `flagship-${runId}@e2e.local`;
    await signUp(page, email, "Flagship Tester");

    const link = await latestConfirmLinkFor(email);
    await page.goto(link);

    // Confirm callback lands on /account, signed in, profile row present.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Flagship Tester" })).toBeVisible();

    // Header island shows the initials avatar (4A/6A). Generous timeout:
    // the island's supabase-js chunk lazy-loads at idle, and against the
    // dev server Turbopack may compile it on first hit.
    await expect(page.locator("header nav a[href='/account']")).toBeVisible({
      timeout: 15_000,
    });

    // Edit display name — round-trips through the RLS-scoped UPDATE (CM4).
    await page.getByLabel(/display name/i).fill("Renamed Tester");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/^saved\.$/i)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Renamed Tester" })).toBeVisible();

    // Sign out returns home and the header reverts to "Sign in".
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("header nav").getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("confirmation link works in a DIFFERENT browser context (mobile cross-browser case)", async ({
    page,
    browser,
  }) => {
    const email = `crossctx-${runId}@e2e.local`;
    await signUp(page, email, "Cross Context");
    const link = await latestConfirmLinkFor(email);

    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(link);
    await expect(freshPage).toHaveURL(/\/account$/);
    await expect(freshPage.getByRole("heading", { name: "Cross Context" })).toBeVisible();
    await freshContext.close();
  });

  test("login before confirming shows the confirm-your-email error", async ({ page }) => {
    const email = `unconfirmed-${runId}@e2e.local`;
    await signUp(page, email);

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("e2e-pass-123");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(/confirm your email/i);
  });

  test("wrong password shows a clear error, no enumeration", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@e2e.local");
    await page.getByLabel(/password/i).fill("definitely-wrong");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(/didn't work/i);
  });

  test("weak password on signup is rejected with clear copy", async ({ page }) => {
    await page.goto("/login?mode=signup");
    // minLength=8 is enforced client-side; assert the native constraint holds.
    const password = page.getByLabel(/password/i);
    await password.fill("short");
    const tooShort = await password.evaluate((el) => (el as HTMLInputElement).validity.tooShort);
    expect(tooShort).toBe(true);
  });

  test("signed-out /account visit redirects to /login (proxy gate)", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("expired/garbage confirmation token → clear error page", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=pkce_garbage&type=email");
    await expect(page).toHaveURL(/\/login\?error=confirm/);
    await expect(page.locator("main").getByRole("alert")).toHaveText(/expired or already used/i);
  });
});
