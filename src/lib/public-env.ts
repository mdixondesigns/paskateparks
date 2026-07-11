// Public env vars are safe in the browser bundle. Validated at first import.
// Server-only secrets live in src/db/env.ts behind `import "server-only"`.

function publicRequired(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing public env var: ${name}. Check .env.local and ensure the NEXT_PUBLIC_ prefix is preserved.`,
    );
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: publicRequired(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicRequired(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
};
