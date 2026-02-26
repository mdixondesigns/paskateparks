import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type NameRelationRow = {
  [key: string]: { name: string } | null;
};

type ParkRow = {
  id: string;
  slug: string | null;
  official_name: string;
  summary: string | null;
  city_town: string;
  status: string;
  park_type: string | null;
  operating_hours: string | null;
  street_address: string | null;
  zip_code: string | null;
  website: string | null;
  year_built: number | null;
  park_size_sqft: number | null;
};

type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

function getNames(rows: NameRelationRow[] | null, key: string): string[] {
  if (!rows) return [];
  // Normalize nested relation rows like { features: { name: "..." } } to string[].
  return rows
    .map((row) => row[key])
    .filter((item): item is { name: string } => Boolean(item))
    .map((item) => item.name);
}

export default async function ParkDetailPage({ params }: DetailPageProps) {
  const { slug } = await params;

  const parkSelect =
    "id, slug, official_name, summary, city_town, status, park_type, operating_hours, street_address, zip_code, website, year_built, park_size_sqft";

  const { data: park, error } = await supabase
    .from("parks")
    .select(parkSelect)
    .eq("slug", slug)
    .single()
    .overrideTypes<ParkRow>();

  if (error || !park) {
    notFound();
  }

  // Related data from normalized join/link tables.
  const [
    aliasesRes,
    featuresRes,
    surfacesRes,
    buildersRes,
    instagramRes,
    youtubeRes,
    fundraiserRes,
    facebookRes,
  ] = await Promise.all([
    supabase.from("park_aliases").select("alias").eq("park_id", park.id),
    // Explicit type overrides keep nested relation types stable in TS/VS Code.
    supabase
      .from("park_features")
      .select("features(name)")
      .eq("park_id", park.id)
      .overrideTypes<{ features: { name: string } | null }[]>(),
    supabase
      .from("park_surfaces")
      .select("surfaces(name)")
      .eq("park_id", park.id)
      .overrideTypes<{ surfaces: { name: string } | null }[]>(),
    supabase
      .from("park_builders")
      .select("builders(name)")
      .eq("park_id", park.id)
      .overrideTypes<{ builders: { name: string } | null }[]>(),
    supabase.from("park_instagram_handles").select("handle").eq("park_id", park.id),
    supabase
      .from("park_youtube_channels")
      .select("channel_url")
      .eq("park_id", park.id),
    supabase
      .from("park_fundraiser_links")
      .select("label, url")
      .eq("park_id", park.id),
    supabase.from("park_facebook_pages").select("title, url").eq("park_id", park.id),
  ]);

  // Flatten related result sets for simple display.
  const aliases = (aliasesRes.data ?? []).map((row) => row.alias);
  const features = getNames(featuresRes.data as NameRelationRow[] | null, "features");
  const surfaces = getNames(surfacesRes.data as NameRelationRow[] | null, "surfaces");
  const builders = getNames(buildersRes.data as NameRelationRow[] | null, "builders");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/parks" className="text-sm text-neutral-600 hover:underline">
        ← Back to parks
      </Link>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">{park.official_name}</h1>
      <p className="mt-1 text-neutral-600">
        {park.city_town} · {park.status.replaceAll("_", " ")}
      </p>

      {park.summary ? <p className="mt-5 whitespace-pre-wrap">{park.summary}</p> : null}

      <section className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        <p>
          <span className="font-semibold">Type:</span>{" "}
          {park.park_type ? park.park_type.replaceAll("_", " ") : "N/A"}
        </p>
        <p>
          <span className="font-semibold">Year built:</span> {park.year_built ?? "N/A"}
        </p>
        <p>
          <span className="font-semibold">Size (sqft):</span> {park.park_size_sqft ?? "N/A"}
        </p>
        <p>
          <span className="font-semibold">Website:</span>{" "}
          {park.website ? (
            <a href={park.website} className="text-blue-700 hover:underline">
              {park.website}
            </a>
          ) : (
            "N/A"
          )}
        </p>
        <p className="sm:col-span-2">
          <span className="font-semibold">Address:</span>{" "}
          {park.street_address
            ? `${park.street_address}, ${park.city_town}${park.zip_code ? ` ${park.zip_code}` : ""}`
            : "N/A"}
        </p>
        <p className="sm:col-span-2">
          <span className="font-semibold">Operating hours:</span>{" "}
          {park.operating_hours ?? "N/A"}
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <p>
          <span className="font-semibold">Aliases:</span>{" "}
          {aliases.length ? aliases.join(", ") : "N/A"}
        </p>
        <p>
          <span className="font-semibold">Features:</span>{" "}
          {features.length ? features.join(", ") : "N/A"}
        </p>
        <p>
          <span className="font-semibold">Surfaces:</span>{" "}
          {surfaces.length ? surfaces.join(", ") : "N/A"}
        </p>
        <p>
          <span className="font-semibold">Builders:</span>{" "}
          {builders.length ? builders.join(", ") : "N/A"}
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <p className="font-semibold">Instagram</p>
        {instagramRes.data?.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {instagramRes.data.map((item) => (
              <li key={item.handle}>{item.handle}</li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">None listed.</p>
        )}

        <p className="pt-3 font-semibold">YouTube</p>
        {youtubeRes.data?.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {youtubeRes.data.map((item) => (
              <li key={item.channel_url}>
                <a href={item.channel_url} className="text-blue-700 hover:underline">
                  {item.channel_url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">None listed.</p>
        )}

        <p className="pt-3 font-semibold">Facebook Pages</p>
        {facebookRes.data?.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {facebookRes.data.map((item) => (
              <li key={item.url}>
                <a href={item.url} className="text-blue-700 hover:underline">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">None listed.</p>
        )}

        <p className="pt-3 font-semibold">Fundraiser Links</p>
        {fundraiserRes.data?.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {fundraiserRes.data.map((item) => (
              <li key={item.url}>
                <a href={item.url} className="text-blue-700 hover:underline">
                  {item.label ? `${item.label}: ${item.url}` : item.url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">None listed.</p>
        )}
      </section>
    </main>
  );
}
