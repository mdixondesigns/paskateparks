import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Stub public env vars so components that read them via src/lib/public-env.ts
// don't throw during import. Tests shouldn't depend on the real Supabase URL —
// we set a deterministic test value here so srcset construction is checkable.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test-project.supabase.co";

// Stub DB env vars so src/db/env.ts (loaded transitively by park-query and
// other server-only modules) doesn't throw at import time. postgres.js is
// lazy — these URLs never connect because tests mock the db client / the
// query functions before any SQL is issued.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DIRECT_URL ??= "postgresql://test:test@localhost:5432/test";

// `server-only` throws at import time outside a server context. Tests that
// touch server-only modules (src/lib/park-query.ts and friends) need it
// neutered. Mocking globally is safe because we never want server-only's
// runtime guard to fire in vitest — happy-dom IS the test boundary.
vi.mock("server-only", () => ({}));
