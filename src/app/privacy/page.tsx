// Phase 6 D11 + CMT-1 — the /privacy page is a stub for cookies and analytics
// (those land with phase 10's GA4 + cookie banner), but the location section
// is REAL because the homepage asks for the user's browser location today.
// A one-line placeholder on a site that asks for location is reputationally
// bad and was flagged by /codex outside voice during plan-eng-review.

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy — Pennsylvania Skateparks",
  description: "How Pennsylvania Skateparks handles location data, cookies, and analytics.",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Privacy</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Your location</h2>
        <p className="mt-2">
          The homepage offers a “Find parks near me” button. When you tap it,
          your browser asks whether to share your device&rsquo;s location with
          this site.
        </p>
        <p className="mt-2">
          If you grant permission, your coordinates are used <em>only inside
          your browser</em>, to sort the list of parks by distance. We do not
          send your location to our servers. We do not store it. We do not
          transmit it anywhere. We do not share it with anyone. If you reload
          the page, the sort resets and we ask again the next time you tap
          the button.
        </p>
        <p className="mt-2">
          If you deny permission, the filter input above the park list works as
          a fallback &mdash; you can type a city or part of a park name to
          narrow the list without sharing your location.
        </p>
        <p className="mt-2">
          You can revoke browser location permission for this site at any time
          from your browser&rsquo;s site settings.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Cookies &amp; analytics</h2>
        <p className="mt-2">
          This page is a placeholder for the cookie and analytics policy. The
          current version of the site does not set tracking cookies or run
          third-party analytics. Real policy text will appear here when those
          tools are added.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="mt-2">
          Questions? Email the maintainer at{" "}
          <a className="underline" href="mailto:michael@inclind.com">
            michael@inclind.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
