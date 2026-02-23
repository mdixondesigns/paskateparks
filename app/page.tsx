export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center gap-4 px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">PA Skate Parks</h1>
      <p className="text-lg text-neutral-600">
        Next.js, TypeScript, Tailwind, and Supabase are configured.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-neutral-700">
        <li>Copy `.env.example` to `.env.local`.</li>
        <li>Add your Supabase project URL and anon key.</li>
        <li>
          Start developing with <code>npm run dev</code>.
        </li>
      </ol>
    </main>
  );
}
