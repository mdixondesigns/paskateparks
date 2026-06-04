import type { NextConfig } from "next";

const config: NextConfig = {
  // A2 (plan-eng-review 2026-06-03): Next.js default no-trailing-slash URLs.
  // WordPress served /park/<slug>/ — we 301 those to /park/<slug> via redirects() below.
  trailingSlash: false,

  // A2 follow-up: redirect /park/<slug>/ → /park/<slug> to preserve SEO equity from
  // the 47 live WP URLs. Phase 5 migration script populates the full slug list;
  // until then the catch-all rule handles every WP-shaped trailing-slash park URL.
  // TODO: replace catch-all with parks-table-driven generation once phase 5 lands.
  async redirects() {
    return [
      {
        source: "/park/:slug/",
        destination: "/park/:slug",
        permanent: true,
      },
      {
        source: "/regions_and_counties/:slug/",
        destination: "/regions_and_counties/:slug",
        permanent: true,
      },
      {
        source: "/park_obstacles/:slug/",
        destination: "/park_obstacles/:slug",
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
