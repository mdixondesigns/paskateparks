import type { Metadata } from "next";
import Link from "next/link";

import { signInAction, signUpAction } from "./actions";

// Map raw error codes (set by the actions as query params) to parent-friendly
// copy. Never echo raw GoTrue errors — they can leak account-existence
// details beyond what Supabase already reveals.
const ERROR_COPY: Record<string, string> = {
  invalid: "That email and password combination didn't work.",
  unconfirmed: "Please confirm your email first — check your inbox for our message.",
  weak_password: "Passwords need at least 8 characters.",
  signup: "We couldn't create that account. Try a different email.",
  name: "Please add a display name (up to 50 characters).",
  confirm: "That confirmation link is expired or already used. Sign in to get a new one.",
};

function errorCopy(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_COPY[code] ?? "Something went wrong. Please try again.";
}

// Merged sign-in / sign-up page (design decision D4) — one route, a mode
// toggle via ?mode=signup. Server component + server actions, zero client JS.
// Signed-in visitors are fine to see this page (no redirect loop risk); the
// proxy only gates /account.

export const metadata: Metadata = {
  title: "Sign in — Pennsylvania Skateparks",
  robots: { index: false },
};

interface LoginPageProps {
  searchParams: Promise<{ mode?: string; error?: string; sent?: string }>;
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:outline-2 focus:outline-offset-1";
const labelClass = "mb-1 block text-sm font-bold";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const signup = params.mode === "signup";
  const error = errorCopy(params.error);

  if (params.sent) {
    return (
      <main id="main" className="mx-auto max-w-sm px-4 py-16">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Check your email</h1>
        <p className="mb-6 text-base">
          We sent you a confirmation link. Click it and you&apos;ll be signed in and
          ready to go.
        </p>
        <p className="text-sm text-neutral-600">
          Nothing arriving? Check spam, or{" "}
          <Link href="/login?mode=signup" className="underline">
            try signing up again
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">
        {signup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-6 text-sm text-neutral-600">
        {signup
          ? "Set a display name, confirm your email, and you're in."
          : "Sign in to manage your account."}
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <form action={signup ? signUpAction : signInAction} className="flex flex-col gap-4">
        {signup ? (
          <div>
            <label htmlFor="display_name" className={labelClass}>
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              maxLength={50}
              autoComplete="nickname"
              className={inputClass}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="w-full cursor-pointer rounded-lg bg-black px-4 py-2.5 font-bold text-white hover:bg-neutral-800"
        >
          {signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm">
        {signup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/login?mode=signup" className="font-semibold underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
