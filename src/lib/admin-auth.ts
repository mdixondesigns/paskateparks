import "server-only";

import { appEnv } from "@/lib/env";

// Signed-cookie admin session — locked phase 9 2A (best-practice signed
// cookie pattern for an admin dashboard) + 9A (24h TTL with sliding refresh).
//
// IMPLEMENTATION NOTE — Web Crypto, not node:crypto.
// This module is imported by middleware.ts, which runs on Next.js's Edge
// runtime. Edge has no `node:crypto` (Node-only). Web Crypto (`crypto.subtle`)
// works in Edge, Node, and browsers. The tradeoff is async — sign/verify
// return Promises rather than sync values. Callers (middleware + the login
// server action) await them.
//
// Cookie format:    <expiry_ts_seconds>.<base64url(hmacSha256(expiry_ts, ADMIN_SECRET))>
//                   e.g. "1781600000.ZmFrZWhtYWN2YWx1ZQ"
//
// Issue:            sign() returns a fresh cookie value with expiry = now + 24h
// Verify:           verify() returns { ok, refreshNeeded } where refreshNeeded
//                   is true when the cookie is older than 12h (sliding-refresh
//                   threshold — middleware re-issues to extend the session).
//
// Kill switch:      rotate ADMIN_SECRET — invalidates every active session
//                   on next request because the stored HMAC no longer
//                   matches the new key.

const TTL_SECONDS = 24 * 60 * 60; // 24 hours
const REFRESH_THRESHOLD_SECONDS = 12 * 60 * 60; // refresh when >12h used

export const COOKIE_NAME = "admin_session";

export interface VerifyResult {
  ok: boolean;
  /** True when the cookie is valid AND past the sliding-refresh threshold. Middleware should re-issue. */
  refreshNeeded: boolean;
}

const encoder = new TextEncoder();

/**
 * Mint a fresh session cookie value. `nowSeconds` is injectable for tests;
 * production callers pass nothing and get Date.now()-based output.
 */
export async function sign(
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const expiry = nowSeconds + TTL_SECONDS;
  const mac = await computeHmac(String(expiry));
  return `${expiry}.${mac}`;
}

/**
 * Verify a presented cookie value. Returns ok=false for missing, malformed,
 * tampered, or expired cookies. Returns ok=true with refreshNeeded=true when
 * the cookie has used >12h of its 24h TTL (sliding refresh signal).
 *
 * `nowSeconds` is injectable for deterministic tests.
 */
export async function verify(
  cookieValue: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!cookieValue) return { ok: false, refreshNeeded: false };
  const dot = cookieValue.indexOf(".");
  if (dot <= 0 || dot === cookieValue.length - 1) {
    return { ok: false, refreshNeeded: false };
  }
  const expiryStr = cookieValue.slice(0, dot);
  const presentedMac = cookieValue.slice(dot + 1);

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || !Number.isInteger(expiry) || expiry <= 0) {
    return { ok: false, refreshNeeded: false };
  }

  // Compare HMAC first (constant time) before expiry check, so an attacker
  // can't distinguish "tampered MAC" from "expired token" via timing.
  const expectedMac = await computeHmac(expiryStr);
  if (!timingSafeEqualStr(presentedMac, expectedMac)) {
    return { ok: false, refreshNeeded: false };
  }

  if (expiry <= nowSeconds) {
    return { ok: false, refreshNeeded: false };
  }

  const remaining = expiry - nowSeconds;
  const refreshNeeded = remaining < TTL_SECONDS - REFRESH_THRESHOLD_SECONDS;
  return { ok: true, refreshNeeded };
}

/**
 * Constant-time compare of the presented login password to the env value.
 * Sync (no HMAC needed — just a string compare). Lengths are leaked, but
 * pre-padding adds little value when the env value is the single source of
 * truth and owner-chosen.
 */
export function verifyPassword(presented: string): boolean {
  return timingSafeEqualStr(presented, appEnv.ADMIN_PASSWORD);
}

async function computeHmac(message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appEnv.ADMIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return arrayBufferToBase64Url(sig);
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time string comparison. Returns true iff `a` and `b` have the
 * same length AND the same bytes. Does NOT short-circuit on the first
 * mismatched byte — the loop always runs to length.
 *
 * Length is leaked (different lengths → fast false). That's fine here:
 * the password length comes from the env value (fixed at deploy) and the
 * HMAC length is fixed by SHA-256 (always 32 bytes → 43 base64url chars).
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
