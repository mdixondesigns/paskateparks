import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center gap-4 px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">PA Skate Parks</h1>
      <p className="text-lg text-neutral-600">Browse and manage parks across Pennsylvania.</p>
      <Link
        href="/parks"
        className="inline-flex rounded-md bg-black px-4 py-2 text-white transition-opacity hover:opacity-85"
      >
        View parks
      </Link>
    </main>
  );
}
