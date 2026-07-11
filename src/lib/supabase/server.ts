import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/public-env";

// Server-side, USER-SCOPED Supabase client for Server Components, Server
// Actions, and Route Handlers. This client carries the visitor's session,
// so RLS policies (auth.uid()) are the enforced security boundary — profile
// writes MUST go through this client, never through the Drizzle secret-key
// clients in src/db/ (review decision CM4).
//
// Identity checks: prefer supabase.auth.getClaims() (local JWT verify) for
// gating pages; use getUser() only when a fresh Auth-server-validated
// record is required (review decision 2A).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll from a Server Component render — cookies are read-only
            // there. Safe to ignore: the proxy refreshes sessions on all
            // auth routes (src/proxy.ts), which is the only place these
            // pages are served from.
          }
        },
      },
    },
  );
}
