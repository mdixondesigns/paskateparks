// Canonical site URL. Used for canonical <link> + JSON-LD absolute URLs.
//
// Defaults to the production domain so preview deploys still emit canonicals
// pointing at the live URL — Google merges signals from both, the live URL
// takes precedence. Override only if the live domain ever moves.

export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://paskateparks.com").replace(/\/$/, "");

export const SITE_NAME = "Pennsylvania Skateparks";
