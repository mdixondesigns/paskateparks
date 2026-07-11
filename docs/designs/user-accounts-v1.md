# Design: User Accounts v1

Generated from /plan-eng-review on 2026-07-07
Branch: main
Status: UNDER REVIEW

## Goal

Visitors can create an account with a display name and a profile picture
(P0 launch blocker, TODOS.md 2026-07-07). Security posture: the most
standard, protected path — Supabase Auth end to end, nothing hand-rolled.

## Locked product decisions (owner, 2026-07-07)

- **D1 Sign-in method:** email + password via Supabase Auth. Email
  confirmation required before first sign-in.
- **D2 Avatars:** generated initials avatar (deterministic color from user
  id + initials from display name). No file upload in v1 — cuts the entire
  user-upload attack surface. Real upload is a post-launch follow-up.
- **D3 Suggestions stay anonymous:** no linkage to the existing
  `suggestions` table in v1. The incentive/leaderboard system is its own
  P0 task and will design that linkage.
- **D4 (scope gate):** login + signup merge into a single `/login` page
  with a mode toggle.

## Current state (verified 2026-07-07)

- No public auth exists. `/admin/*` uses a custom HMAC cookie
  (src/lib/admin-auth.ts) — separate system, untouched by this plan.
- `@supabase/supabase-js` installed; `@supabase/ssr` NOT installed.
- All DB access is server-side Drizzle (direct + pooled clients) using the
  secret key. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is provisioned in env
  but shipped nowhere — this feature puts it in the browser for the first
  time.
- RLS enabled on all 12 public tables with ZERO policies (default deny).
- `src/proxy.ts` (Next 16 rename of middleware) already exists: 410 gate +
  admin auth, with a deliberately narrow matcher to protect the Vercel
  Hobby 1M/mo edge-invocation budget.
- SiteHeader + NavLinks exist (TODOS.md "no header" P1 entry is stale —
  strike it as part of this work).

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │ Browser                                   │
                    │  ┌────────────────┐  ┌─────────────────┐ │
                    │  │ /login page     │  │ NavLinks island  │ │
                    │  │ (client form)   │  │ (session state)  │ │
                    │  └───────┬────────┘  └────────┬────────┘ │
                    └──────────┼────────────────────┼──────────┘
                        signUp/signIn          getClaims()/
                               │               onAuthStateChange
                               ▼                    │
                    ┌──────────────────────────────────────────┐
                    │ Supabase Auth (GoTrue)                    │
                    │  email+password, confirmation email,      │
                    │  rate limiting, JWT issuance              │
                    └──────────┬───────────────────────────────┘
                               │ INSERT auth.users
                               ▼
                    ┌──────────────────────────────────────────┐
                    │ Postgres trigger (SECURITY DEFINER,       │
                    │ owner=postgres): create public.profiles   │
                    │ row {id, display_name}                    │
                    └──────────────────────────────────────────┘

  Session storage: cookies via @supabase/ssr. NOTE (CM2): these are
  JS-readable by design — that is the documented @supabase/ssr pattern
  that lets both the browser client and the server read the session.
  Protection comes from short-lived asymmetric JWTs + refresh rotation,
  not httpOnly. Do not claim httpOnly anywhere in code comments.
  Server verification: getClaims() for page protection,
  getUser() only when a fresh Auth-server-validated record is needed.
  Profile WRITES (CM4): /account server actions use the SSR user-scoped
  client — NOT Drizzle's secret key — so the auth.uid() = id RLS policy
  is the enforced security boundary, not a hand-written WHERE clause.
```

### Session refresh & the proxy budget

`src/proxy.ts` gains a third responsibility: Supabase session refresh via
`@supabase/ssr`'s server client — but ONLY on auth-relevant routes. The
matcher extends to `/login`, `/account`, `/auth/:path*` and nothing else.
Static/ISR park + taxonomy pages never invoke the proxy (edge budget
preserved, SEO architecture untouched).

Header session state renders client-side: NavLinks gains a small client
island that reads the session from the browser client (supabase-js
auto-refreshes tokens client-side). Static pages stay fully static;
signed-in state hydrates after paint. No server component ever branches
on auth state outside /account.

### Files

New:
- `src/lib/supabase/browser.ts` — browser client (publishable key)
- `src/lib/supabase/server.ts` — server client (cookie-aware, for
  /account server component + auth callback route)
- `src/app/login/page.tsx` — merged sign-in / sign-up (client form,
  server actions)
- `src/app/account/page.tsx` — display name edit, sign out
- `src/app/auth/confirm/route.ts` — email-confirmation callback
  (token exchange)
- `src/components/site/InitialsAvatar.tsx` — pure component
- `supabase/migrations/0007_profiles.sql` — table + trigger + RLS policies
  (0006 is taken by 0006_add_park_alias.sql)
- `supabase/config.toml` + local-stack wiring — `supabase init` so
  `supabase start` works for integration/E2E (CM1: this does not exist
  yet; it is setup work in this plan, not assumed infrastructure)
- e2e + unit tests (see Test plan)

Modified:
- `src/proxy.ts` — extend matcher + session refresh on auth routes.
  Composition spec (CM6.4): the 410 and /admin/* branches return FIRST,
  exactly as today; Supabase session refresh runs only for the new,
  disjoint auth paths (/login, /account, /auth/*). No response-cookie
  merging is ever needed because no request matches both branches — assert
  this disjointness in the proxy regression test.
- `src/db/schema.ts` — profiles table (Drizzle mirror); update the
  hard-coded 11-table count in schema.test.ts to 12 (CM6.3)
- `src/components/site/NavLinks.tsx` — gains the auth nav item inline
  (CM5: no separate island component). Server HTML renders a fixed-width
  "Sign in" default (zero CLS, 4A); a one-line cookie-presence check gates
  a dynamic import of the browser client (6A) so signed-out visitors on
  LCP-critical park pages never download supabase-js. No separate
  import-budget test — the boundary is documented with a comment.
- `.env.example`, `package.json` (add `@supabase/ssr`)
- `TODOS.md` — strike stale header entry, mark accounts item in progress

## Database

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Own-row read ONLY in v1 (CM3): nothing in v1 displays other users'
-- names, so don't expose them. Widen to public read in the same
-- migration that ships the leaderboard/photo-credit surface.
create policy "users read own profile"
  on public.profiles for select using (auth.uid() = id);

-- Users update only their own row; display_name only (no id churn).
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- No INSERT policy: rows are created by the trigger below (definer),
-- never directly by clients.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- CM6.2: clamp bad metadata so it can NEVER block signup —
  -- trim, empty/whitespace-only → fallback, truncate to the check's 50.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Skater'), 50)
  );
  return new;
end;
$$;
-- owner must be postgres, NOT supabase_auth_admin (permission scope)

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Display name is collected at signup (passed via `options.data` so the
trigger reads it from `raw_user_meta_data`) and editable at /account.

**Trigger failure risk:** a failing trigger blocks ALL signups (verified
Supabase pitfall). Mitigations: `coalesce` fallback name, `search_path`
pinned, migration test that inserts an auth user locally and asserts the
profile row appears.

## Supabase Auth configuration (dashboard, launch checklist)

- Email provider on; confirm email REQUIRED.
- Confirmation flow pinned (CM6.5): the email template links to
  `/auth/confirm?token_hash=...&type=email`; the route handler calls
  `verifyOtp({ token_hash, type })` (token-hash pattern, NOT the OAuth
  `code` exchange) and redirects to `/account`. `emailRedirectTo` is set
  explicitly in the signUp call. Local E2E and production exercise the
  SAME flow.
- Site URL = production domain; redirect allowlist = production + localhost.
  **Pre-DNS-flip note (2026-07-11):** paskateparks.com still points at the
  old WordPress site. Until the DNS flip, Site URL must be
  `https://paskateparks.vercel.app` (that's where confirmation links must
  land); switching it to `https://paskateparks.com` is a DNS-flip-day
  checklist item.
- Built-in auth rate limits left at defaults.
- Password minimum length 8+; enable leaked-password protection if plan allows.

## UI (per VISUAL-DESIGN.md — read before building)

- `/login`: single card, mode toggle (Sign in / Create account), email +
  password (+ display name in signup mode). Warm-cream surface, Cabinet
  Grotesk, ink buttons. Non-skater-parent friendly copy.
- `/account`: initials avatar, display-name field, save, sign out.
- AuthNavItem in header: "Sign in" link when signed out; initials avatar
  linking to /account when signed in.

## Test plan

Test infrastructure (finding 5A + CM1): local Supabase stack does NOT
exist yet — first task is `supabase init` + config.toml + docs. Then
`supabase start` backs integration + E2E runs; confirmation emails are
read from the local mail-trap API so the flagship E2E exercises the REAL
emailed link (same token_hash flow as production, per CM6.5).

Unit:
- InitialsAvatar: deterministic color for same id; initials extraction
  (single name, two names, emoji-only, empty → fallback; 1/50/51 chars).
- profiles Drizzle schema round-trip.
- NavLinks: renders fixed-slot "Sign in" with no session cookie;
  swaps to initials avatar when signed in (CM5 inline, no island).

Integration/DB (local supabase):
- Trigger creates profile row on auth.users insert WITH and WITHOUT
  display_name metadata (fallback path) — signup must succeed both ways (3A).
- RLS audit (closes deferred TODOS.md item): anon + authenticated clients
  exercise every public table; assert profiles SELECT is the only
  non-denied read, profiles UPDATE succeeds only on own row (and fails on
  another user's row), everything else denies.
- auth/confirm route: valid token, expired token, already-used token.

E2E (Playwright):
- FLAGSHIP: signup → trapped confirmation email → callback → signed-in
  header → edit display name → logout
- signup with duplicate email → clear error
- weak password → inline error
- login BEFORE confirming → clear "confirm your email" error
- login wrong password → clear error
- signed-out visit to /account → redirected to /login
- confirmation link opened in a fresh browser context (mobile
  cross-browser case) → still lands signed-in or gives a clear next step
- double-submit on signup and on account save

REGRESSION (CRITICAL — proxy.ts matcher change touches existing behavior):
- /admin/* still gated by the HMAC cookie after the matcher extension
- /builder/* and /shop/* still return 410 with body
- /login, /account, /auth/* now pass through session refresh
- a static park page does NOT invoke the proxy (budget guard, 1A)

## NOT in scope

- Avatar file upload (D2 — post-launch)
- OAuth providers (D1)
- Suggestions/photo-credit/favorites linkage (D3 — separate P0 tasks)
- Password strength meter beyond Supabase minimums
- Admin auth migration to Supabase Auth (separate system, working fine)

## What already exists (reused, not rebuilt)

- RLS migration framework (supabase/migrations/) — extended, not replaced
- src/proxy.ts — extended with one new matcher scope, not duplicated
- SiteHeader/NavLinks — one new item, no new header
- env validation pattern for the publishable key
- Admin HMAC auth — untouched

## Failure modes (per new codepath)

| Codepath | Realistic failure | Test? | Handled? | User sees |
|---|---|---|---|---|
| profiles trigger | bad metadata / permissions → signup blocked | yes (3A both-ways test) | yes (clamp, owner=postgres) | clear signup error only if Supabase itself is down |
| /auth/confirm | expired/reused token_hash | yes | yes | clear "link expired, resend" page |
| proxy session refresh | Supabase Auth unreachable at edge | regression test (pass-through) | yes — fail open to signed-out, never block the page | page loads, signed-out header |
| NavLinks lazy import | dynamic import fails (offline nav) | unit test | yes — stays on "Sign in" default | static header, no error |
| /account save | RLS denies (session expired mid-edit) | yes (RLS audit) | yes — error state + re-auth prompt | "session expired, sign in again" |
| RLS policies | policy typo exposes a table | RLS audit sweeps every table | n/a (test IS the guard) | nothing — caught pre-deploy |

Critical gaps (no test AND no handling AND silent): **none**.

## Worktree parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| S1 Local supabase stack (config.toml, docs) | supabase/ | — |
| S2 Migration 0007 + Drizzle schema + trigger/RLS tests | supabase/migrations/, src/db/ | S1 (tests run on local stack) |
| S3 @supabase/ssr clients + proxy extension + regression tests | src/lib/supabase/, src/proxy.ts | — |
| S4 /login + /account + /auth/confirm + NavLinks item | src/app/, src/components/site/ | S2, S3 |
| S5 Flagship E2E + RLS audit | e2e/ | S1–S4 |

Lane A: S1 → S2 (sequential, shared supabase/)
Lane B: S3 (independent)
Launch A + B in parallel; merge; then S4 → S5 sequential.
No module overlap between lanes — no conflict flags.

## Implementation Tasks
Synthesized from this review's findings. Checkbox as you ship.

- [ ] **T1 (P1, human: ~half day / CC: ~30min)** — supabase/ — `supabase init` + config.toml + local-stack docs (CM1)
  - Files: supabase/config.toml, README or CLAUDE.md testing note
  - Verify: `supabase start` boots; mail-trap reachable
- [ ] **T2 (P1, human: ~half day / CC: ~20min)** — db — migration 0007: profiles + hardened trigger + own-row RLS (3A, CM3, CM6.2)
  - Files: supabase/migrations/0007_profiles.sql, src/db/schema.ts, src/db/schema.test.ts (11→12)
  - Verify: trigger test passes with AND without metadata; 51-char name signs up
- [ ] **T3 (P1, human: ~half day / CC: ~20min)** — auth plumbing — @supabase/ssr clients + proxy matcher extension (1A, CM6.4)
  - Files: src/lib/supabase/{browser,server}.ts, src/proxy.ts, package.json
  - Verify: proxy regression tests (admin gate, 410, park-page non-invocation)
- [ ] **T4 (P1, human: ~1 day / CC: ~45min)** — UI — /login (merged, D4), /account (SSR user-scoped writes, CM4), /auth/confirm (token_hash, CM6.5), NavLinks item (4A+6A per CM5)
  - Files: src/app/login/, src/app/account/, src/app/auth/confirm/, src/components/site/NavLinks.tsx, InitialsAvatar.tsx
  - Verify: unit tests + VISUAL-DESIGN.md compliance
- [ ] **T5 (P1, human: ~1 day / CC: ~45min)** — tests — flagship E2E via trapped email + RLS audit sweep (5A, closes deferred TODOS item)
  - Files: e2e/auth.spec.ts, e2e/rls-audit.spec.ts (or scripts/)
  - Verify: full suite green on local stack
- [ ] **T6 (P2, human: ~15min / CC: ~2min)** — docs — strike stale "Global header" P1 entry from TODOS.md; mark accounts item in progress
  - Files: TODOS.md
  - Verify: n/a

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (2026-07-06 run was for bbox-filter, not this plan) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_FOUND (absorbed) | 10 findings, all resolved via CM1–CM6 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 16 issues (6 review + 10 outside voice), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not yet run for this plan |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not yet run |

- **CODEX:** 10 outside-voice findings — migration numbering, missing local-stack config, httpOnly inconsistency, trigger metadata clamp, premature public profile reads, unspecified write path, table-count test, header over-machinery, proxy composition, confirm-flow spec — every one resolved by explicit owner decision (CM1–CM6).
- **CROSS-MODEL:** Claude review + Codex agreed on architecture fundamentals (proxy scoping, trigger pattern, RLS posture); tension on profile-read exposure and header machinery resolved in Codex's favor (CM3) and via a middle path (CM5) respectively.
- **VERDICT:** ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
