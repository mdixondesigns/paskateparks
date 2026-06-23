import Link from "next/link";

// Compact homepage footer rendered at the bottom of the SyncedMapList's
// scrollable list pane. The site-wide Footer is hidden on / so this is the
// only footer the user sees on the homepage. Copyright + privacy link only
// (no about link by user request).
export function HomeFooter() {
  return (
    <footer className="border-t px-4 py-6 text-xs text-neutral-600">
      <p>
        © {new Date().getFullYear()} Pennsylvania Skateparks ·{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </footer>
  );
}
