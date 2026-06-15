import { describe, expect, it } from "vitest";

import { COOKIE_NAME, sign, verify, verifyPassword } from "./admin-auth";

// vitest.setup.ts stubs ADMIN_SECRET and ADMIN_PASSWORD to deterministic
// values so signing roundtrips are reproducible across runs.

describe("COOKIE_NAME", () => {
  it("is admin_session", () => {
    expect(COOKIE_NAME).toBe("admin_session");
  });
});

describe("sign + verify roundtrip", () => {
  it("a fresh cookie verifies OK", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const result = await verify(cookie, now);
    expect(result.ok).toBe(true);
  });

  it("refreshNeeded is false immediately after signing (well within 12h threshold)", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const result = await verify(cookie, now);
    expect(result.refreshNeeded).toBe(false);
  });

  it("refreshNeeded is false at 11h59m (just under the threshold)", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const eleven_h_59 = now + 11 * 60 * 60 + 59 * 60;
    expect((await verify(cookie, eleven_h_59)).refreshNeeded).toBe(false);
  });

  it("refreshNeeded flips true after 12h have elapsed", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const after_12h = now + 12 * 60 * 60 + 1;
    const result = await verify(cookie, after_12h);
    expect(result.ok).toBe(true);
    expect(result.refreshNeeded).toBe(true);
  });

  it("cookie expires at exactly 24h", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const at_24h = now + 24 * 60 * 60;
    expect((await verify(cookie, at_24h)).ok).toBe(false);
  });

  it("cookie is still valid at 24h-1s", async () => {
    const now = 1_700_000_000;
    const cookie = await sign(now);
    const just_before_24h = now + 24 * 60 * 60 - 1;
    expect((await verify(cookie, just_before_24h)).ok).toBe(true);
  });
});

describe("verify — rejects malformed input", () => {
  it("returns ok=false for undefined", async () => {
    expect((await verify(undefined)).ok).toBe(false);
  });
  it("returns ok=false for null", async () => {
    expect((await verify(null)).ok).toBe(false);
  });
  it("returns ok=false for empty string", async () => {
    expect((await verify("")).ok).toBe(false);
  });
  it("returns ok=false when there's no dot separator", async () => {
    expect((await verify("abc123")).ok).toBe(false);
  });
  it("returns ok=false when there's nothing after the dot", async () => {
    expect((await verify("1700000000.")).ok).toBe(false);
  });
  it("returns ok=false when there's nothing before the dot", async () => {
    expect((await verify(".somemac")).ok).toBe(false);
  });
  it("returns ok=false when expiry isn't an integer", async () => {
    expect((await verify("not-a-number.somemac")).ok).toBe(false);
  });
  it("returns ok=false when expiry is negative", async () => {
    expect((await verify("-100.somemac")).ok).toBe(false);
  });
});

describe("verify — tampering", () => {
  it("returns ok=false when the HMAC is wrong (someone forged a token)", async () => {
    const now = 1_700_000_000;
    const expiry = now + 24 * 60 * 60;
    const forged = `${expiry}.fake_hmac_value`;
    expect((await verify(forged, now)).ok).toBe(false);
  });

  it("returns ok=false when the expiry was bumped (would re-issue if accepted)", async () => {
    const now = 1_700_000_000;
    const realCookie = await sign(now);
    const [expiry, mac] = realCookie.split(".");
    const tampered = `${Number(expiry) + 86400}.${mac}`;
    expect((await verify(tampered, now)).ok).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("returns true when password matches ADMIN_PASSWORD env (test value)", () => {
    expect(verifyPassword("test-admin-password")).toBe(true);
  });
  it("returns false on wrong password", () => {
    expect(verifyPassword("wrong-password")).toBe(false);
  });
  it("returns false on empty string", () => {
    expect(verifyPassword("")).toBe(false);
  });
  it("returns false on length mismatch", () => {
    expect(verifyPassword("short")).toBe(false);
  });
});
