# Handoff: CEO scope review — community contribution features (PA Skateparks)

> Written 2026-07-13 as a handoff for a fresh session. Self-contained — assumes no prior context.

## Your task
Run `/plan-ceo-review` to scope and **sequence** the "community contribution" feature set below for PA Skateparks — decide what ships at launch vs. fast-follow — then recommend `/plan-eng-review` for the security-sensitive architecture. When the CEO-review scope gate asks what to review, **this feature set is the target** (there is no branch or plan file yet).

## Where the project is
- Next.js 16 (App Router, RSC) + Drizzle + Supabase Postgres directory of ~159 PA skateparks. Tailwind v4, Vitest + Playwright, Storybook.
- Live rebuild at **paskateparks.vercel.app**; paskateparks.com still serves old WordPress until a deliberate DNS flip. **Launch targeted this month.** Hosting: Vercel Hobby + Supabase free tier; cost target **$0**.
- The directory itself (map, search, 16-section park profiles, county/obstacle archives) is **launch-worthy today**.
- Accounts v1 shipped + verified: email+password (Supabase Auth), `profiles` = id/display_name/created_at, initials avatars, **no photo upload**. See `docs/designs/user-accounts-v1.md`.

## The problem
Accounts and "suggest an edit" are **inert plumbing with no product loop**:
- An account grants nothing — no reason to sign up.
- Suggest-edit is a single **free-text blob** (`SuggestEditModal` → `suggestions` table), anonymous, **emails no one**, and the owner must manually translate each one into a **hand-written DB upload**. Users don't even know which fields are suggestable.

## The vision (owner's direction — community-building is the focus)
1. **Gate suggest-edit behind account creation** (gives accounts a purpose).
2. **Structured suggestions** — either per-field targeted edits (description, lights, hours, surface…) or a Google-Maps-style questionnaire that asks about a park's *missing* fields (great for stub parks).
3. **Admin approval queue** — owner approves/denies and the approved change **writes to the DB** (no manual uploads). `suggestions.status` already has `new | in_review | applied | rejected`.
4. **Admin "new park" / "edit park" workflow for the owner** — he has **~20 more parks** (details + photos) to add and needs a real UI, not SQL/Studio.
5. **Photo upload** — users and owner can add photos to a park. **High priority: many parks have zero photos.** This is the deliberately-deferred "single riskiest surface" (untrusted file upload).
6. **Incentives** — submission/photo leaderboard, photo credits, favorite parks (+ a parks leaderboard). This is where the owner wants the site's identity.

## The keystone
Everything on the owner side — approving suggestions, new/edit park, photo upload, populating the new `hero_photo_path` panorama and the held rules-sign photo, authoring stub parks — hinges on ONE thing that **does not exist: an admin surface that writes to the database.** Today the only admin pages are `/admin/lint` (read-only) + `/admin/login` (auth via `proxy.ts`); all content is authored via migration/seed scripts + Supabase Studio. **Building the admin write surface unblocks the whole list at once — treat it as the highest-leverage item.**

## Decisions to lock in the review
- **Launch cut vs. fast-follow.** Prior recommendation: core loop (account-gated + structured suggest + admin approval queue) is the launch cut; incentives are fast-follow. But the owner now calls **photo upload "super important,"** and wants the **admin new/edit-park workflow** — re-weigh whether those join the launch cut.
- **Structured suggestions:** per-field (simple, one-click apply) vs. questionnaire (richer, better for stubs), or per-field first / questionnaire later.
- **Admin new/edit-park scope:** which fields are editable, how photos are managed, how much CMS to build vs. minimal.
- **Photo-upload security posture:** owner-only ingest first vs. user submissions; dedicated bucket + per-user-path RLS + size/MIME caps + Sharp resize (mirror the existing photos-bucket pipeline). Security-sensitive → hand to eng review.
- **Incentive ordering:** favorites is cheap + low-risk (join table + toggle); leaderboard needs the `profiles` SELECT policy widened (P1 tripwire already noted); photo credits depends on upload (`park_photos.credit` column already exists).

## Constraints & gotchas (read before proposing architecture)
- **Migrations are hand-written SQL** in `supabase/migrations/` (descriptive names, e.g. `0008_add_hero_photo_path.sql`), applied with `pnpm db:migrate` (has `--dry-run`). **Do NOT run `pnpm db:generate` / drizzle-kit generate** — its snapshot is stale and emits broken diffs (tries to recreate `profiles`, re-add `alias`). `schema.ts` is the TYPE source of truth only.
- **Local dev connects to the shared PROD Supabase DB** (ref `djhuxetdljryleztkdrp`, labeled "paskateparks-dev"). Drizzle `select().from(parks)` lists every schema column, so adding a column to `schema.ts` breaks ALL park reads locally AND in prod until the migration is applied. **Apply migrations before deploying schema changes.**
- **RLS is on all 12 tables.** `profiles` SELECT is own-row-only — widen to public read in the SAME migration that ships the leaderboard/photo-credit surface, and update the RLS-audit test. Anon/publishable key is INSERT-only into `suggestions`.
- Auth emails go through **Resend SMTP**; Supabase gates email-template editing behind SMTP.
- Next.js 16 uses **`proxy.ts`** (not middleware.ts) with a **narrow matcher** scoped to `/login`, `/account`, `/auth/*` for the Vercel Hobby budget — don't broaden it to run on every route.
- Commits attribute to **mdixondesigns** via repo-local git config (don't touch global). Direct-to-main workflow. A pre-push redaction hook warns (non-blocking) on emails/vendor names.

## Recently shipped this session (on main)
Hero aspect lock (16:9 desktop / 3:2 mobile), `parks.hero_photo_path` panorama field (nullable, falls back to first gallery photo; migration 0008 already applied to prod DB), Airbnb-style gallery collage, cursor:pointer, rewritten privacy policy (contact `mike@paskateparks.com`), monochrome social/support link icons. The **helmet/pads Park-Rules redesign was HELD** (see TODOS.md) — blocked on the same admin-write gap.

## Read first
- Docs: `DESIGN.md` (product truth, locked D1–D30), `VISUAL-DESIGN.md` (visual truth), `STACK-PIVOT.md` (data+hosting), `docs/designs/user-accounts-v1.md` (auth + the CM3 profiles-SELECT tripwire), `TODOS.md` (backlog incl. "Avatar file upload", "Widen profiles SELECT", incentive/leaderboard).
- Code: `src/db/schema.ts` (parks, park_photos, suggestions, profiles), `src/components/park/SuggestEditModal.tsx`, `src/app/admin/*`, `src/proxy.ts`, `scripts/migrate-wp/photos.ts` (Sharp pipeline), `scripts/db-migrate.ts`.
