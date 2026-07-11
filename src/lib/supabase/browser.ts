import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/public-env";

// Browser-side Supabase client (publishable key — safe in the bundle, RLS
// is the enforcement layer). Session lives in JS-readable cookies by design
// (@supabase/ssr pattern): protection is short-lived asymmetric JWTs +
// refresh rotation, NOT httpOnly. See docs/designs/user-accounts-v1.md CM2.
//
// Do not import this module eagerly from components rendered on static
// park/taxonomy pages — dynamic-import it behind the session-cookie check
// (finding 6A) so signed-out visitors never download supabase-js.
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
