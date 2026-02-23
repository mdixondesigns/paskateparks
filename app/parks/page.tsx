import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type ParkListItem = {
  id: string;
  official_name: string;
  city_town: string;
  status: string;
};

export default async function ParksPage() {
  const { data, error } = await supabase
    .from("parks")
    .select("id, official_name, city_town, status")
    .order("official_name", { ascending: true });

  const parks = (data ?? []) as ParkListItem[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Skate Parks</h1>

      {error ? (
        <p className="mt-4 text-sm text-red-700">
          Could not load parks: {error.message}
        </p>
      ) : parks.length === 0 ? (
        <p className="mt-4 text-neutral-600">No parks found yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {parks.map((park) => (
            <li key={park.id} className="rounded-lg border p-4">
              <Link
                href={`/parks/${park.id}`}
                className="text-lg font-semibold hover:underline"
              >
                {park.official_name}
              </Link>
              <p className="text-sm text-neutral-600">
                {park.city_town} · {park.status.replaceAll("_", " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
