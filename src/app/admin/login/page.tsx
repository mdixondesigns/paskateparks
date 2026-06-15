import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_NAME, sign, verifyPassword } from "@/lib/admin-auth";

// Owner login for /admin/*. Single password input → POSTs to a server action
// that verifies via timingSafeEqual, sets a HMAC-signed session cookie
// (24h sliding TTL per 9A), and redirects to /admin/lint.
//
// Brute-force mitigation (CMT-6, outside voice): 1-second constant-time delay
// on every POST regardless of password correctness, so a misguess costs the
// attacker time but doesn't punish the legitimate owner more than once per
// week. Online guessing of a random-ish 16-char password at 1 guess/sec is
// computationally infeasible without Upstash; Turnstile + Upstash are
// deferred per E5 amendment (trigger: ≥10 spam rows).

const CONSTANT_TIME_DELAY_MS = 1_000;

async function loginAction(formData: FormData): Promise<void> {
  "use server";

  // Constant-time delay BEFORE any branch — so success and failure paths
  // take the same wall-clock time from the attacker's POV.
  const presented = String(formData.get("password") ?? "");

  await new Promise<void>((resolve) => setTimeout(resolve, CONSTANT_TIME_DELAY_MS));

  if (!verifyPassword(presented)) {
    redirect("/admin/login?error=1");
  }

  const cookieValue = await sign();
  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  redirect("/admin/lint");
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main
      id="main"
      style={{
        maxWidth: "20rem",
        margin: "6rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Admin login</h1>
      <form action={loginAction}>
        <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem" }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            fontSize: "1rem",
            border: "1px solid #999",
            borderRadius: "4px",
            marginBottom: "1rem",
          }}
        />
        {error ? (
          <p style={{ color: "#c00", marginBottom: "1rem", fontSize: "0.875rem" }}>
            Incorrect password.
          </p>
        ) : null}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "0.625rem 1rem",
            fontSize: "1rem",
            background: "#000",
            color: "#fff",
            border: 0,
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
