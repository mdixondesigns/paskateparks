"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { InitialsAvatar } from "./InitialsAvatar";

const LINKS = [
  { href: "/about", label: "About" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

interface SessionUser {
  id: string;
  displayName: string;
}

// Auth nav item — user-accounts v1 (docs/designs/user-accounts-v1.md 4A/6A/CM5).
//
// CLS contract (4A): the slot ALWAYS renders — "Sign in" is the server-HTML
// default in a fixed-width slot, so the header never shifts when auth state
// hydrates. Signed-in users see "Sign in" flash to their avatar on cold load;
// that's the accepted tradeoff for keeping every page static.
//
// Bundle contract (6A): supabase-js is NOT in this chunk. A cookie-presence
// check gates a dynamic import, so the signed-out majority on LCP-critical
// park pages never downloads the auth client.
function fromSession(session: { user: { id: string; user_metadata?: Record<string, unknown> } } | null): SessionUser | null {
  const sessionUser = session?.user;
  if (!sessionUser) return null;
  return {
    id: sessionUser.id,
    displayName:
      typeof sessionUser.user_metadata?.display_name === "string"
        ? sessionUser.user_metadata.display_name
        : "Skater",
  };
}

function useSessionUser(pathname: string | null): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);

  // Re-runs on every route change: sign-in and sign-out both land via
  // client-side navigations (server-action redirects), so a mount-only
  // effect would leave the header stale until a hard reload.
  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    // @supabase/ssr session cookies are named sb-<ref>-auth-token[.N] and are
    // JS-readable by design (CM2). No cookie → signed out → clear and skip
    // the import. (Async so the setState isn't synchronous in the effect.)
    if (!document.cookie.includes("-auth-token")) {
      queueMicrotask(() => {
        if (!cancelled) setUser(null);
      });
      return;
    }

    void import("@/lib/supabase/browser")
      .then(({ createClient }) => {
        if (cancelled) return;
        const supabase = createClient();
        // getSession, not getClaims: this is DISPLAY state (name + avatar),
        // not an authorization decision — those happen server-side against
        // RLS. getSession reads the cookie locally (no network, no JWT-key
        // dependency); a forged cookie could only mislabel the visitor's own
        // header, and every real action still verifies server-side.
        void supabase.auth.getSession().then(({ data }) => {
          if (!cancelled) setUser(fromSession(data.session));
        });
        // Live updates for same-page auth changes (e.g. token refresh,
        // sign-out in another tab).
        subscription = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setUser(fromSession(session));
        }).data.subscription;
      })
      .catch(() => {
        // Import failed (offline nav) — stay on the "Sign in" default.
      });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [pathname]);

  return user;
}

export function NavLinks() {
  const pathname = usePathname();
  const user = useSessionUser(pathname);

  return (
    <ul role="list" className="flex items-center gap-4 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className="hover:underline focus:underline aria-[current=page]:underline aria-[current=page]:font-semibold"
            >
              {label}
            </Link>
          </li>
        );
      })}
      {/* TEMP launch hide (2026-07, CEO review 2026-07-15): the auth entry point
          is hidden until Phase 3 gives accounts a purpose — no reason to sign up
          yet, so we don't advertise a door into an empty room. To restore, swap
          `hidden` back to `flex`. The session hook still runs but no-ops for
          signed-out visitors (no auth cookie → no supabase-js import), so this
          costs the launch audience nothing. */}
      {/* Fixed-width slot: sized to the wider of its two states ("Sign in"
          text vs 32px avatar) so the swap never reflows the nav (4A). */}
      <li className="hidden min-w-14 justify-end">
        {user ? (
          <Link
            href="/account"
            aria-label={`Account — signed in as ${user.displayName}`}
            className="rounded-full focus:outline-2 focus:outline-offset-2"
          >
            <InitialsAvatar userId={user.id} displayName={user.displayName} />
          </Link>
        ) : (
          <Link
            href="/login"
            aria-current={isActive(pathname, "/login") ? "page" : undefined}
            className="hover:underline focus:underline aria-[current=page]:underline aria-[current=page]:font-semibold"
          >
            Sign in
          </Link>
        )}
      </li>
    </ul>
  );
}
