import { test, expect } from "@playwright/test";

// RLS audit — closes the deferred TODOS.md item ("Supabase RLS audit before
// launch"): now that the publishable key ships in the browser bundle
// (user-accounts v1), exercise EVERY public table from the anon and
// authenticated roles and assert the expected denials.
//
// API-only (no browser); runs against the local Supabase stack. Guarded the
// same way as auth.spec.ts. Local demo keys are the supabase-cli defaults —
// override via env when they rotate.

const LOCAL_AUTH = process.env.E2E_LOCAL_AUTH === "1";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
// The publishable key is browser-safe by definition; this is the universal
// supabase-cli local demo value. The secret key must come from env — get it
// with: SUPABASE_LOCAL_SECRET_KEY=$(supabase status -o json | jq -r '.SECRET_KEY')
// (GitHub push protection pattern-matches sb_secret_* literals, and rightly so.)
const PUBLISHABLE =
  process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SECRET = process.env.SUPABASE_LOCAL_SECRET_KEY ?? "";

// Every application table in the public schema (schema.test.ts asserts this
// list's Drizzle mirror stays at 12). If a table is added there, add it here.
const ALL_TABLES = [
  "parks",
  "park_renovations",
  "park_riding_surfaces",
  "park_obstacles",
  "park_amenities",
  "park_links",
  "builders",
  "park_builders",
  "shops",
  "park_photos",
  "suggestions",
  "profiles",
] as const;

async function rest(
  path: string,
  opts: { token?: string; method?: string; body?: unknown; prefer?: string } = {},
) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${opts.token ?? PUBLISHABLE}`,
      "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function createConfirmedUser(email: string, displayName?: string) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: "audit-pass-123",
      email_confirm: true,
      ...(displayName ? { user_metadata: { display_name: displayName } } : {}),
    }),
  });
  const user = (await res.json()) as { id: string };
  expect(user.id, `admin createUser failed for ${email}`).toBeTruthy();
  return user.id;
}

async function tokenFor(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "audit-pass-123" }),
  });
  const { access_token } = (await res.json()) as { access_token: string };
  expect(access_token, `password grant failed for ${email}`).toBeTruthy();
  return access_token;
}

test.describe("RLS audit — publishable key against every public table", () => {
  test.skip(!LOCAL_AUTH, "E2E_LOCAL_AUTH=1 + local Supabase stack required");
  test.skip(
    LOCAL_AUTH && !SECRET,
    "SUPABASE_LOCAL_SECRET_KEY required — see header comment",
  );

  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "desktop-chromium",
      "API-only audit; one project is enough.",
    );
  });

  const runId = Date.now().toString(36);

  for (const table of ALL_TABLES) {
    test(`anon cannot SELECT from ${table}`, async () => {
      const { status } = await rest(`${table}?select=*&limit=1`);
      // 42501 permission-denied surfaces as 401/403/404 depending on layer;
      // anything but 200 is a denial. Belt-and-suspenders: even a 200 must
      // carry zero rows.
      expect(status, `${table} anon SELECT should be denied`).not.toBe(200);
    });

    test(`anon cannot INSERT into ${table}`, async () => {
      const { status } = await rest(table, { method: "POST", body: {} });
      expect([400, 401, 403, 404, 405]).toContain(status);
      expect(status).not.toBe(201);
    });
  }

  test("trigger: user WITH display_name metadata gets a profile row (reads it back)", async () => {
    const email = `audit-named-${runId}@e2e.local`;
    await createConfirmedUser(email, "Audit Named");
    const token = await tokenFor(email);
    const { status, json } = await rest("profiles?select=display_name", { token });
    expect(status).toBe(200);
    expect(json).toEqual([{ display_name: "Audit Named" }]);
  });

  test("trigger: user WITHOUT metadata gets the fallback name — signup never blocked", async () => {
    const email = `audit-fallback-${runId}@e2e.local`;
    await createConfirmedUser(email);
    const token = await tokenFor(email);
    const { status, json } = await rest("profiles?select=display_name", { token });
    expect(status).toBe(200);
    expect(json).toEqual([{ display_name: "Skater" }]);
  });

  test("authenticated sees ONLY their own profile row (CM3)", async () => {
    const emailA = `audit-a-${runId}@e2e.local`;
    const emailB = `audit-b-${runId}@e2e.local`;
    await createConfirmedUser(emailA, "User A");
    await createConfirmedUser(emailB, "User B");
    const tokenA = await tokenFor(emailA);
    const { json } = await rest("profiles?select=display_name", { token: tokenA });
    expect(json).toEqual([{ display_name: "User A" }]);
  });

  test("authenticated can UPDATE own display_name; other rows untouched (CM4)", async () => {
    const email = `audit-upd-${runId}@e2e.local`;
    const id = await createConfirmedUser(email, "Before Rename");
    const token = await tokenFor(email);

    const own = await rest(`profiles?id=eq.${id}`, {
      method: "PATCH",
      token,
      body: { display_name: "After Rename" },
      prefer: "return=representation",
    });
    expect(own.status).toBe(200);
    expect(own.json).toEqual([expect.objectContaining({ display_name: "After Rename" })]);

    // Cross-user update: RLS filters the target row → zero rows affected.
    const otherEmail = `audit-victim-${runId}@e2e.local`;
    const victimId = await createConfirmedUser(otherEmail, "Victim");
    const cross = await rest(`profiles?id=eq.${victimId}`, {
      method: "PATCH",
      token,
      body: { display_name: "HACKED" },
      prefer: "return=representation",
    });
    expect(cross.json).toEqual([]);

    const victimToken = await tokenFor(otherEmail);
    const check = await rest("profiles?select=display_name", { token: victimToken });
    expect(check.json).toEqual([{ display_name: "Victim" }]);
  });

  test("authenticated cannot INSERT or DELETE profiles (trigger/cascade only)", async () => {
    const email = `audit-nowrite-${runId}@e2e.local`;
    const id = await createConfirmedUser(email, "No Write");
    const token = await tokenFor(email);

    const ins = await rest("profiles", {
      method: "POST",
      token,
      body: { id: crypto.randomUUID(), display_name: "Forged" },
    });
    expect(ins.status).not.toBe(201);

    const del = await rest(`profiles?id=eq.${id}`, { method: "DELETE", token, prefer: "return=representation" });
    // No DELETE grant/policy → denied outright or zero rows affected.
    if (del.status === 200) {
      expect(del.json).toEqual([]);
    } else {
      expect([401, 403, 404]).toContain(del.status);
    }
  });

  test("authenticated cannot read other application tables (deny-all posture holds)", async () => {
    const email = `audit-tables-${runId}@e2e.local`;
    await createConfirmedUser(email);
    const token = await tokenFor(email);
    for (const table of ALL_TABLES.filter((t) => t !== "profiles")) {
      const { status } = await rest(`${table}?select=*&limit=1`, { token });
      expect(status, `${table} authenticated SELECT should be denied`).not.toBe(200);
    }
  });
});
