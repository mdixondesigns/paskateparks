import "@testing-library/jest-dom/vitest";

// Stub public env vars so components that read them via src/lib/public-env.ts
// don't throw during import. Tests shouldn't depend on the real Supabase URL —
// we set a deterministic test value here so srcset construction is checkable.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test-project.supabase.co";
