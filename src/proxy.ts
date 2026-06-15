import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAME, sign, verify } from "@/lib/admin-auth";
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
// The matcher (bottom of file) restricts middleware to /builder/*, /shop/*,
// /admin/* — Vercel Hobby's Edge Middleware budget is 1M invocations/mo,
// and a naive "run on everything" would burn through it via crawler hits on
// /park/<slug> and the 52 taxonomy archives (CMT-7 outside voice).

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

  // Anything outside the matcher shouldn't reach here, but bypass safely if it does.
  return NextResponse.next();
}

export const config = {
  matcher: ["/builder/:path*", "/shop/:path*", "/admin/:path*", "/admin"],
};

// Inline HTML for the 410 page. Small, no external CSS, the kind of body
// Google's SEO pipeline rewards for de-indexing speed.
const GONE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Page gone — Pennsylvania Skateparks</title>
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
