export const dynamic = "force-static";

export const metadata = {
  title: "About — PA Skateparks",
  description:
    "PA Skateparks is a free resource that makes Pennsylvania's skateparks more accessible, maintained by Mike Dixon.",
};

export default function AboutPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">About</h1>
      <p className="mt-4">
        PA Skateparks is a free resource intended to make skateparks more
        accessible through awareness. It is actively maintained by long time
        skater and technology guy, Mike Dixon.
      </p>
      <p className="mt-4">
        Connect with me at{" "}
        <a className="underline" href="mailto:mike@paskateparks.com">
          mike@paskateparks.com
        </a>{" "}
        or{" "}
        <a
          className="underline"
          href="https://instagram.com/paskateparks"
          target="_blank"
          rel="noopener noreferrer"
        >
          @paskateparks
        </a>{" "}
        on Instagram.
      </p>
    </main>
  );
}
