export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold">Pennsylvania Skateparks</h1>
      <p className="mt-4">
        Scaffold phase complete. Real homepage (D6 list-first per DESIGN.md, geolocation
        per phase 6) lands once Supabase data is wired up in phase 2 + 3.
      </p>
      <ul className="mt-6 list-disc pl-6">
        <li>Next.js 16 App Router + TypeScript strict</li>
        <li>Tailwind v4 defaults (visual system from VISUAL-DESIGN.md deferred)</li>
        <li>Supabase + Drizzle land in phase 2</li>
      </ul>
    </main>
  );
}
