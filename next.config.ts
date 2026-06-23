import type { NextConfig } from "next";

const config: NextConfig = {
  // A2 (plan-eng-review 2026-06-03): Next.js default no-trailing-slash URLs.
  // WordPress served /park/<slug>/ — we 301 those to /park/<slug> via redirects() below.
  trailingSlash: false,

  // Phase 8 CMT-2A — WP taxonomy URL shapes 301 to the new shorter shape.
  // Four explicit rules per taxonomy (with- and without- trailing slash)
  // because next.config.ts redirects don't accept regex/optional segments.
  //
  //   /park/:slug/                       → /park/:slug                  (phase 5, A2)
  //   /regions_and_counties/:slug/{,}    → /county/:slug                (phase 8)
  //   /park_obstacles/:slug/{,}          → /obstacle/:slug              (phase 8)
  //
  // All permanent (301) — SEO equity transfers to the new URLs and Google
  // de-indexes the old ones within a few weeks.
  async redirects() {
    return [
      // Phase 10 D13 — /map retired in favor of the synced map+list layout on /.
      // 301 so any external links (and the bare /map URLs we shipped through
      // phase 7-9) transfer SEO equity to the homepage.
      {
        source: "/map",
        destination: "/",
        permanent: true,
      },

      // Phase 5 trailing-slash strip for /park/<slug>/.
      {
        source: "/park/:slug/",
        destination: "/park/:slug",
        permanent: true,
      },

      // Phase 8 county archive — WP /regions_and_counties/:slug → /county/:slug.
      {
        source: "/regions_and_counties/:slug",
        destination: "/county/:slug",
        permanent: true,
      },
      {
        source: "/regions_and_counties/:slug/",
        destination: "/county/:slug",
        permanent: true,
      },

      // Phase 8 obstacle archive — WP /park_obstacles/:slug → /obstacle/:slug.
      {
        source: "/park_obstacles/:slug",
        destination: "/obstacle/:slug",
        permanent: true,
      },
      {
        source: "/park_obstacles/:slug/",
        destination: "/obstacle/:slug",
        permanent: true,
      },
    ];
  },

  // F2 (STACK-PIVOT.md): no Vercel Image transformations. Photos are pre-resized
  // by Sharp at migration time (400/800/1200 WebP) and served as native <picture>
  // via the <ResponsiveImage> component. Disabling next/image's optimizer keeps us
  // off the free-tier 1000 source-image/mo cap.
  images: {
    unoptimized: true,
  },

  // Phase 4 will switch on once we know the prod Supabase Storage hostname.
  // experimental: {},
};

export default config;
