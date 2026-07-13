// Real privacy policy authored 2026-07-13 against how the site actually works
// post user-accounts-v1: in-browser-only geolocation, Supabase Auth accounts
// (email + display name), suggest-an-edit submissions (optional name/email +
// /24-truncated IP), and the three processors we send data to. No analytics or
// tracking cookies — only the essential Supabase auth session cookie.
//
// page.test.tsx guards the location copy and the contact email against
// regressing; keep those phrasings if you edit.

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy — PA Skateparks",
  description:
    "How Pennsylvania Skateparks handles your location, account details, suggested edits, and cookies.",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Privacy</h1>
      <p className="mt-2 text-sm text-neutral-600">Last updated: July 2026</p>

      <p className="mt-6">
        Pennsylvania Skateparks is a directory of skateparks across the state.
        We keep the amount of personal data we collect deliberately small. This
        page explains exactly what we collect, why, and who processes it.
      </p>

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
        <h2 className="text-lg font-semibold">Accounts</h2>
        <p className="mt-2">
          You can browse the entire site without an account. If you choose to
          create one, we collect your email address, a password, and a display
          name. Passwords are handled by our authentication provider (Supabase)
          and are stored hashed &mdash; we never see or store your plain
          password.
        </p>
        <p className="mt-2">
          Your profile picture is generated from your initials. We do not
          collect or store uploaded photos of you.
        </p>
        <p className="mt-2">
          We use your email only to operate your account &mdash; confirming your
          address, signing you in, and resetting your password. We do not send
          marketing email, and we do not sell or share your email address. You
          can delete your account at any time by emailing us at the address
          below; deleting it removes your profile and display name.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Suggesting an edit</h2>
        <p className="mt-2">
          Each park page has a “Suggest an edit” form so you can help us keep
          park details accurate. The only required field is your suggested
          change. Your name and email are optional &mdash; provide them only if
          you&rsquo;d like us to be able to follow up.
        </p>
        <p className="mt-2">
          To reduce spam, when a suggestion is submitted we store a shortened
          version of your IP address (the last portion is discarded, so it
          cannot identify a specific device). We use suggestions to review and
          update park information.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Cookies &amp; analytics</h2>
        <p className="mt-2">
          This site does not run third-party analytics and does not set
          advertising or tracking cookies.
        </p>
        <p className="mt-2">
          If you sign in, we set a single essential cookie that keeps you logged
          in as you move between pages. It is not used for tracking, and it is
          not set unless you have an account and are signed in.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Who processes your data</h2>
        <p className="mt-2">
          We rely on a few service providers to run the site. They process data
          on our behalf and only for the purposes above:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> &mdash; database and account
            authentication (stores your account details and suggested edits).
          </li>
          <li>
            <strong>Vercel</strong> &mdash; website hosting and delivery.
          </li>
          <li>
            <strong>Resend</strong> &mdash; sends account emails such as address
            confirmation and password resets.
          </li>
        </ul>
        <p className="mt-2">
          We do not sell your personal data.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="mt-2">
          Questions about your privacy, or want your account or data deleted?
          Email us at{" "}
          <a className="underline" href="mailto:mike@paskateparks.com">
            mike@paskateparks.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
