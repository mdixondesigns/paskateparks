"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Server actions for the merged sign-in / sign-up page. All Supabase Auth —
// no hand-rolled password handling (docs/designs/user-accounts-v1.md D1).
// Errors travel as query params (same pattern as /admin/login) so the page
// stays a server component with zero client JS.

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const code = error.code === "email_not_confirmed" ? "unconfirmed" : "invalid";
    redirect(`/login?error=${code}`);
  }

  redirect("/account");
}

export async function signUpAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  // The DB trigger clamps display_name defensively (0007_profiles.sql), but
  // the form validates properly so users get a real error, not a truncation.
  if (displayName.length < 1 || displayName.length > 50) {
    redirect("/login?mode=signup&error=name");
  }

  // emailRedirectTo derived from the request origin so localhost, preview,
  // and production each confirm back to themselves (CM6.5). Production's
  // dashboard redirect-allowlist is the enforcement layer.
  const origin = (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    const code = error.code === "weak_password" ? "weak_password" : "signup";
    redirect(`/login?mode=signup&error=${code}`);
  }

  redirect("/login?sent=1");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
