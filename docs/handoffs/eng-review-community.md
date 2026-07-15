# Handoff: Eng review — community contribution architecture (PA Skateparks)

> Written 2026-07-15 as the output of `/plan-ceo-review` (see `ceo-review-community.md` for
> the input brief). Self-contained. Feeds `/plan-eng-review`.

## Your task
Run `/plan-eng-review` on the security-sensitive architecture for the community-contribution
program. **Start with Phase 1 (admin CMS write surface) + Phase 2 (photo upload pipeline)** —
they are the highest-leverage and most security-sensitive, and Phase 1 unblocks the held
helmet/rules-sign and hero-panorama work. Phases 3–5 get their own eng review when scoped.

## CEO review outcome (2026-07-15)
- **Mode:** HOLD SCOPE + phased launch-cut. The 6-feature vision is accepted; it's a
  **post-launch program**, not a launch blocker. The directory launches independently — it's
  ready today.
- **Keystone build = Approach B: a full in-app admin CMS** (owner new/edit park on real
  forms), not a thin Studio bridge.
- **Why the phasing:** verified against the prod DB on 2026-07-15 — **111 of 159 parks (70%)
  are stubs** (no description AND no photos); only 48 are filled; only 1 lacks coordinates.
  The dominant near-term problem is *owner content authoring*, not community engagement. A
  community/incentive loop over a 70%-empty directory has nothing to stand on. So: owner
  authoring tools first, community loop second, incentives last.

## The program (dependency-ordered)

| Phase | Ships | Gates on | Security weight |
|---|---|---|---|
| 0 | Launch the directory | nothing — ready now | none |
| 1 | Admin CMS (owner new/edit park, full in-app forms) | HMAC admin gate | **keystone** |
| 2 | Photo upload — **owner-first** via CMS | Phase 1 | high (trusted user only) |
| 3 | Account-gated + per-field structured suggest + approval-apply | Phase 1 mutations | medium |
| 4 | Open photo upload to users + photo credits | Phase 2 hardened | **highest — untrusted upload** |
| 5 | Favorites → leaderboard (+ `profiles` SELECT widening) | Phases 3–4 | medium (RLS) |

## Locked decisions

### Admin auth: keep the HMAC gate; do NOT unify with Supabase yet
- **What exists:** `/admin/*` is guarded by a single-password HMAC signed-cookie gate
  (`src/lib/admin-auth.ts`, enforced in `src/proxy.ts`). This is NOT an identity system —
  it's one shared password on a door, no accounts. Supabase Auth is the separate, real
  identity system for *public users* (`profiles`, RLS).
- **Decision:** build Phase 1 (CMS) and Phase 3 (approval queue) on the **existing HMAC
  gate**. The owner just needs to be "an authenticated admin," which HMAC already provides.
  Where the approval queue needs an approver identity, use a constant — there is one approver.
  This is the lazy-correct answer at bus-factor 1; collapsing into Supabase roles solves a
  multi-admin problem the project does not have.
- **Do this on purpose, not by inertia.** The two-auth split is deliberate: a bug in the
  user system can't touch admin, and vice versa, and the blast radius of each is small.
- **Trigger to migrate to Supabase roles (retire HMAC in the same change):** the FIRST time
  any of these is real —
  1. a second admin who needs their own login + accountability;
  2. **community moderators** — trusted contributors who can approve suggestions (a natural
     extension of the Phase 5 incentive vision; this is the most likely trigger);
  3. a real audit trail of who changed/approved what.
  None are on the table for launch. Until one is, the split stays.

### Other locked calls
- **Studio stays the escape hatch.** Build forms for common fields + child tables (obstacles,
  amenities, surfaces, links, photos, renovations); don't chase every edge into forms in v1.
- **Structured suggestions: per-field first, questionnaire later.** The questionnaire's main
  value was filling stubs, but the owner now fills stubs via the CMS, so its value is largely
  absorbed.
- **Photo security: owner-only ingest first (Phase 2), users last (Phase 4).** Harden the
  pipeline against one trusted user before exposing untrusted upload — the single riskiest
  surface in the program.
- **Favorites before leaderboard.** Favorites needs no RLS change; the leaderboard forces the
  `profiles` SELECT widening — ship it in the SAME migration + update the RLS-audit test
  (P1 tripwire in TODOS.md).

## Decisions to resolve in eng review (0E)
1. **CMS write path (Phase 1):** service-role Drizzle writes must live ONLY behind `/admin/*`
   (HMAC); never a publishable-key write path. CMS writes must fire `/api/revalidate` for the
   affected slug without re-entering the webhook loop (`last_revalidated_at` guard in
   `src/lib/revalidate-resolver.ts`). Every editable field needs server-side validation
   (enum membership, link URL format, lat/lng bounds).
2. **Suggestions schema (Phase 3):** free-text `changeDescription` → a per-field model
   (`target_field` + `proposed_value`, or a JSON patch) PLUS a `submitter_id` tying
   suggestions to accounts (needed for the leaderboard). Both are migrations.
3. **Photo pipeline (Phase 2/4):** reuse the Sharp 3-width resize
   (`scripts/migrate-wp/photos.ts`); 10MB + jpeg/png/webp caps; `parks/<slug>/photo-NN`
   storage-path convention. Phase 4 adds per-user-path RLS write policy on the bucket.
   **Cost flag:** bulk owner upload across 111 stubs could blow Vercel Hobby's 1000/mo
   image-source cap — consider a pre-resize path or a ceiling alert (ties to the existing
   "Cost ceiling alerting" TODO).

## Constraints & gotchas (read before proposing architecture)
- **Migrations are hand-written SQL** in `supabase/migrations/`, applied with `pnpm db:migrate`
  (`--dry-run` available). **Do NOT run `pnpm db:generate` / drizzle-kit generate** — stale
  snapshot, destructive diffs. `schema.ts` is the TYPE source of truth only. (The `schema.ts`
  header comment was corrected 2026-07-15 to say this — it previously told you to run the
  forbidden command.)
- **Local dev connects to the shared PROD DB** (ref `djhuxetdljryleztkdrp`). Adding a column
  to `schema.ts` breaks ALL park reads until the migration is applied. Apply migrations before
  deploying schema changes.
- **RLS is on all 12 tables.** `profiles` SELECT is own-row-only — widen only when the
  leaderboard/photo-credit surface ships, in the same migration, and update the RLS-audit test.
- **Next.js 16 uses `proxy.ts`** with a narrow matcher (`/login`, `/account`, `/auth/*`,
  `/admin/*`, retired `/builder|/shop`). Don't broaden it to run on every route (Vercel Hobby
  Edge budget).

## Read first
- `ceo-review-community.md` (this review's input brief), `DESIGN.md`, `STACK-PIVOT.md`,
  `docs/designs/user-accounts-v1.md`, `TODOS.md`.
- Code: `src/lib/admin-auth.ts`, `src/proxy.ts`, `src/db/schema.ts`,
  `src/components/park/SuggestEditModal.tsx`, `src/app/api/suggestions/route.ts`,
  `scripts/migrate-wp/photos.ts`, `scripts/db-migrate.ts`.
