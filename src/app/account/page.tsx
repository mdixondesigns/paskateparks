import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InitialsAvatar } from "@/components/site/InitialsAvatar";
import { createClient } from "@/lib/supabase/server";

import { signOutAction } from "../login/actions";

// /account — display-name edit + sign out. The proxy already redirects
// signed-out visitors to /login (src/proxy.ts branch 4); the getClaims()
// check here is belt-and-suspenders for direct renders.
//
// Writes go through the user-scoped @supabase/ssr client so the
// `auth.uid() = id` RLS policy is the enforcement boundary (CM4) — NOT the
// Drizzle secret-key clients, which bypass RLS.

export const metadata: Metadata = {
  title: "Your account — Pennsylvania Skateparks",
  robots: { index: false },
};

async function updateNameAction(formData: FormData): Promise<void> {
  "use server";

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length < 1 || displayName.length > 50) {
    redirect("/account?error=name");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  // RLS allows this UPDATE only on the caller's own row.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", data.claims.sub);

  if (error) {
    redirect("/account?error=save");
  }

  // Keep the JWT's copy in sync so the header avatar shows the new name
  // without waiting for a token refresh.
  await supabase.auth.updateUser({ data: { display_name: displayName } });

  redirect("/account?saved=1");
}

interface AccountPageProps {
  searchParams: Promise<{ error?: string; saved?: string }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }
  const userId = String(data.claims.sub);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  // Profile row is trigger-created at signup; missing means something is
  // genuinely wrong (see failure-mode table in the design doc) — fall back
  // to the JWT metadata rather than crashing.
  const displayName =
    profile?.display_name ??
    (typeof data.claims.user_metadata?.display_name === "string"
      ? data.claims.user_metadata.display_name
      : "Skater");

  return (
    <main id="main" className="mx-auto max-w-sm px-4 py-16">
      <div className="mb-6 flex items-center gap-4">
        <InitialsAvatar userId={userId} displayName={displayName} size={56} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{displayName}</h1>
          <p className="text-sm text-neutral-600">Your account</p>
        </div>
      </div>

      {params.error === "name" ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          Display names need to be 1–50 characters.
        </p>
      ) : null}
      {params.error === "save" ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          We couldn&apos;t save that — your session may have expired. Try signing in
          again.
        </p>
      ) : null}
      {params.saved ? (
        <p
          role="status"
          className="mb-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          Saved.
        </p>
      ) : null}

      <form action={updateNameAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="display_name" className="mb-1 block text-sm font-bold">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            maxLength={50}
            defaultValue={displayName}
            autoComplete="nickname"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:outline-2 focus:outline-offset-1"
          />
        </div>
        <button
          type="submit"
          className="w-full cursor-pointer rounded-lg bg-black px-4 py-2.5 font-bold text-white hover:bg-neutral-800"
        >
          Save
        </button>
      </form>

      <form action={signOutAction} className="mt-8 border-t border-neutral-200 pt-6">
        <button
          type="submit"
          className="w-full cursor-pointer rounded-lg border border-neutral-300 px-4 py-2.5 font-semibold hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
