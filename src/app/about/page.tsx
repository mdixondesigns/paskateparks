// Phase 6 D11 stub. Final copy lands later — this just makes the footer link
// resolve to a real 200 route so /about isn't a 404.

export const dynamic = "force-static";

export const metadata = {
  title: "About — Pennsylvania Skateparks",
  description: "About the Pennsylvania Skateparks directory.",
};

export default function AboutPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">About</h1>
      <p className="mt-4">
        Pennsylvania Skateparks is a directory of public skateparks across
        Pennsylvania. The site is maintained by a single person; full copy
        and credits land in a future update.
      </p>
    </main>
  );
}
