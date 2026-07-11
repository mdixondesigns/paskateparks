import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAME, sign, verify } from "@/lib/admin-auth";
import { env } from "@/lib/public-env";
import { isRetiredBuilderOrShopPath } from "@/lib/retired-urls";

// Phase 9 proxy (formerly middleware — renamed for Next 16 per https://nextjs.org/docs/messages/middleware-to-proxy) — two responsibilities:
//
//  1. HTTP 410 Gone for /builder/* and /shop/* (D3 + 6A locked).
//     Body is a small HTML page with a link back to / and /map/ so Google
//     de-indexes faster than a bare 410 (per TODOS.md P1 entry — 410-with-body
//     is favored by the SEO de-index pipeline).
//
//  2. Admin auth gate for /admin/* (2A + 9A locked).
//     • /admin/login: passthrough so the login page can render.
//     • Everything else under /admin/*: verify HMAC cookie. Missing / expired
//       / tampered → redirect to /admin/login. Valid + past sliding-refresh
//       threshold (12h used of 24h TTL) → re-issue cookie and pass through.
//
//  3. Supabase session refresh for the visitor-accounts routes (/login,
//     /account, /auth/*) — user-accounts v1, decision 1A + CM6.4.
//     Branch ordering contract: the 410 and /admin/* branches return FIRST,
//     exactly as before; Supabase code runs only for its own disjoint path
//     set, so no request ever needs response-cookie merging between the
//     admin HMAC cookie and Supabase's session cookies.
//     /account additionally requires a session (redirect to /login).
//
// The matcher (bottom of file) restricts middleware to /builder/*, /shop/*,
// /admin/*, /login, /account, /auth/* — Vercel Hobby's Edge Middleware
// budget is 1M invocations/mo, and a naive "run on everything" would burn
// through it via crawler hits on /park/<slug> and the 52 taxonomy archives
// (CMT-7 outside voice). Supabase's canonical run-on-everything middleware
// matcher must NEVER be adopted here for the same reason.
//
//                         request
//                            │
//              ┌─────────────┼──────────────────┐
//              ▼             ▼                  ▼
//        /builder|/shop   /admin/*        /login /account /auth/*
//         410 + body     HMAC gate        Supabase session refresh
//         (return)       (return)         (+ /account → session gate)

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Retired /builder/* and /shop/* → 410 Gone with body.
  if (isRetiredBuilderOrShopPath(pathname)) {
    return new NextResponse(GONE_HTML, {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Tell crawlers to stop refetching — combined with 410 status this
        // accelerates Google de-indexing.
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 2. /admin/login is the unauthed entry point.
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  // 3. /admin/* (else) → require valid HMAC cookie.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const result = await verify(cookie);
    if (!result.ok) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
    const response = NextResponse.next();
    if (result.refreshNeeded) {
      // Sliding refresh: cookie used >12h of its 24h TTL. Re-issue with a
      // fresh 24h expiry so an active owner doesn't get bounced to /login
      // mid-session, while an inactive cookie still hard-expires after 24h.
      response.cookies.set({
        name: COOKIE_NAME,
        value: await sign(),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60,
      });
    }
    return response;
  }

  // 4. Visitor-accounts routes → Supabase session refresh (+ /account gate).
  if (isSupabaseAuthPath(pathname)) {
    return refreshSupabaseSession(request);
  }

  // Anything outside the matcher shouldn't reach here, but bypass safely if it does.
  return NextResponse.next();
}

function isSupabaseAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/account" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

// Canonical @supabase/ssr session refresh (https://supabase.com/docs/guides/auth/server-side/nextjs),
// scoped to the auth routes above. Refreshes an expired session and syncs
// the rotated cookies onto both the forwarded request and the response.
async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() verifies the JWT locally and triggers the refresh flow when
  // expired (decision 2A). If Supabase Auth is unreachable, claims come back
  // null and we fail OPEN to signed-out — the page still loads (failure-mode
  // table in docs/designs/user-accounts-v1.md).
  const { data } = await supabase.auth.getClaims();

  // /account requires a session; everything else on these routes is public.
  if (!data?.claims && request.nextUrl.pathname === "/account") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/builder/:path*",
    "/shop/:path*",
    "/admin/:path*",
    "/admin",
    "/login",
    "/account",
    "/auth/:path*",
  ],
};

// Inline HTML for the 410 page. Small, no external CSS, the kind of body
// Google's SEO pipeline rewards for de-indexing speed.
const GONE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Page gone — PA Skateparks</title>
  <style>
    html,body{margin:0;padding:0;height:100%;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#faf6ef;color:#1a1a1a}
    main{max-width:32rem;margin:0 auto;padding:4rem 1.5rem;line-height:1.5}
    h1{font-size:1.5rem;margin:0 0 1rem}
    p{margin:0 0 1rem;color:#444}
    a{color:#1a1a1a;text-decoration:underline}
    nav{margin-top:2rem;display:flex;gap:1rem;flex-wrap:wrap}
    nav a{padding:0.5rem 1rem;border:1px solid #1a1a1a;text-decoration:none;border-radius:4px}
    nav a:hover{background:#1a1a1a;color:#faf6ef}
  </style>
</head>
<body>
  <main>
    <h1>This page is permanently gone.</h1>
    <p>The Pennsylvania Skateparks directory was rebuilt. Builder and shop pages no longer have their own URLs — that information now lives on the relevant park profiles.</p>
    <nav aria-label="Where to go next">
      <a href="/">Browse parks</a>
      <a href="/map">Open the map</a>
    </nav>
  </main>
</body>
</html>`;
