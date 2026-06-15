import "server-only";

import { NextResponse } from "next/server";

import { dbPooled } from "@/db/pooled";
import { suggestions } from "@/db/schema";
import { truncateIp } from "@/lib/ip-truncate";

// POST /api/suggestions — backend for the D28 Suggest-an-Edit modal.
//
// v1 spam protection = honeypot + Supabase RLS deny-all-anon (per E5 amendment
// 2026-06-03). Turnstile + Upstash explicitly deferred — trigger to add them
// is ≥10 obvious-spam rows in any rolling 7-day window.
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │  POST body (JSON):                                              │
//   │    parkId            number — required                          │
//   │    changeDescription string — required, 1..2000 chars           │
//   │    name              string — optional, ≤200 chars              │
//   │    email             string — optional, basic shape check       │
//   │    reason            string — optional, ≤2000 chars             │
//   │    referralSource    string — HONEYPOT — must be empty/absent   │
//   └────────────────────────────────────────────────────────────────┘
//
// Honeypot mechanism (CMT-4 outside voice — renamed from "website" which is
// in OWASP wordlists). Field is rendered in the form with off-screen CSS +
// aria-hidden + tabindex=-1 + autocomplete=off. Bots that scrape and fill
// every input get caught; the server silently returns 200 (don't leak that
// it's a honeypot — bots tune around 4xx responses).
//
// `runtime = 'nodejs'` mirrors /api/revalidate — needed because the IP
// truncation lives in Node-only code (no Edge-incompatible APIs, but pinning
// is defensive).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SuggestionBody {
  parkId?: unknown;
  changeDescription?: unknown;
  name?: unknown;
  email?: unknown;
  reason?: unknown;
  referralSource?: unknown;
}

const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_REASON_CHARS = 2_000;
const MAX_NAME_CHARS = 200;
const MAX_EMAIL_CHARS = 320; // RFC 5321 limit

export async function POST(request: Request): Promise<NextResponse> {
  let body: SuggestionBody;
  try {
    body = (await request.json()) as SuggestionBody;
  } catch {
    return NextResponse.json({ error: "malformed_json" }, { status: 400 });
  }

  // HONEYPOT — silent 200, no insert. Bots that filled the field never know.
  if (
    typeof body.referralSource === "string" &&
    body.referralSource.trim().length > 0
  ) {
    return NextResponse.json({ ok: true });
  }

  const parkId = Number(body.parkId);
  if (!Number.isInteger(parkId) || parkId <= 0) {
    return NextResponse.json({ error: "invalid_parkId" }, { status: 400 });
  }

  const changeDescription =
    typeof body.changeDescription === "string" ? body.changeDescription.trim() : "";
  if (changeDescription.length === 0) {
    return NextResponse.json(
      { error: "missing_change_description" },
      { status: 400 },
    );
  }
  if (changeDescription.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json(
      { error: "change_description_too_long", max: MAX_DESCRIPTION_CHARS },
      { status: 400 },
    );
  }

  const name = optionalString(body.name, MAX_NAME_CHARS);
  const email = optionalString(body.email, MAX_EMAIL_CHARS);
  const reason = optionalString(body.reason, MAX_REASON_CHARS);

  // Loose email shape check — we're not verifying deliverability, just
  // rejecting obvious garbage. If owner wants to reach out, the field is
  // useful; if it's malformed, store null rather than the junk.
  const sanitizedEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;

  const submitterIpTruncated = truncateIp(
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
  );

  try {
    await dbPooled.insert(suggestions).values({
      parkId,
      submitterName: name ?? null,
      submitterEmail: sanitizedEmail,
      changeDescription,
      reason: reason ?? null,
      submitterIpTruncated,
      // status, createdAt default at the DB layer.
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // FK violation = parkId doesn't exist (deleted between page load and
    // submit). 400 with a friendly code so the modal can render a sensible
    // inline error ("park is no longer in the directory").
    if (message.includes("foreign key") || message.includes("violates")) {
      return NextResponse.json({ error: "park_not_found" }, { status: 400 });
    }
    console.error(`[suggestions] insert failed: ${message}`);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return trimmed.slice(0, max);
  return trimmed;
}
