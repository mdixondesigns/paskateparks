# TODOs — PA Skateparks Rebuild

Captured by /plan-eng-review on 2026-05-30. Items the eng review surfaced but explicitly deferred or left as content/ops work.

**Updated after Supabase pivot** (STACK-PIVOT.md) — Airtable-specific items retired, two Supabase items added.

---

## P1 — should ship with v1 or shortly after

### Alt-text strategy for migrated photos
**What:** Decide ownership for backfilling alt text on ~1500 photos migrated from WP. Auto-generated `"FDR Skatepark photo 3"` per D29 fails WCAG 1.1.1 meaningfully and is bad SEO snippet material.
**Why:** Accessibility compliance + Google image search. Audit confirmed 0/20 sampled WP photos have alt text.
**Pros:** Better screen-reader UX, eligibility for image-rich Google snippets, real accessibility win.
**Cons:** ~1500 photos × ~30s per alt text = ~12 hours of owner time. Not technical work.
**Context:** D29 already supports `Caption` and `Credit` on the Photos child table — alt text fits in there or a new `AltText` field. Render template should prefer `AltText`, fall back to `Caption`, fall back to auto-gen.
**Depends on:** D4 migration complete (need records to author against).

### 410 page body
**What:** Design the page that renders behind D2's 410 status. Currently spec'd as bare 410 — Google ranks 410-with-content better than bare 410.
**Why:** Stronger SEO signal, better UX for any human who hits the URL.
**Pros:** Better de-indexing speed, optional CTA to the new directory.
**Cons:** ~30 min of work.
**Context:** Middleware can return a Response with HTML body. Suggest: "This page is permanently gone. [Browse parks](/) or [open the map](/map/)."

### iOS vs Android directions deep links
**What:** Spec the UA-detection logic for "Get Directions" buttons. `geo:` URI doesn't work cleanly on iOS Safari — needs `maps://` or `https://maps.apple.com/?ll=`.
**Why:** Parents on iPhones (large share of mobile traffic) get a broken or confusing experience without this.
**Pros:** Reliable native-maps handoff for the P0 parent flow.
**Cons:** Trivial — ~1 hour of code, 1 Playwright test per platform.
**Context:** Test plan already lists this; just needs the implementation spec. Add to /park/<slug>/ page component.

### /new-park/ form destination — SITE-AUDIT §9 #6
**What:** Find out where the existing /new-park/ submissions go (email? CRM? Airtable already?). Migrate the flow into the new Suggestions table (or a separate New Park Submissions table).
**Why:** If you don't ask the owner, you silently break a content-acquisition channel that's been running for years.
**Pros:** Preserves an existing inflow channel.
**Cons:** Requires owner interview + possibly a separate table.
**Context:** Owner conversation needed before launch. Likely splits into a separate Airtable table from Suggestions (different shape: name of new park + nominator contact vs. correction to existing park).

### Owner workflow for 99 stub parks
**What:** Define the Airtable view + checklist the owner uses to author the 99 stub parks. Without it, "filled in over time" stays vague forever.
**Why:** This is the content debt you migrated, not a v2 thing. Without a workflow, stubs sit blank.
**Pros:** Owner has a clear path forward post-launch. Visible progress.
**Cons:** Owner-time intensive.
**Context:** Suggest an Airtable view named "Stubs to author" filtered by `Description IS EMPTY OR Photos IS EMPTY`, sorted by `Name`. Each row has the schema the owner needs to fill. Add a "% complete" formula field for visibility.

### Redirect-table maintenance for /park/<slug>/ → /park/<slug>
**What:** Decide and implement how `next.config.ts`'s `redirects()` block stays in sync as new parks are authored. Options: (a) hardcoded list updated by hand, (b) build-time script `scripts/generate-redirects.ts` reads the `parks` table and emits a generated JSON that `next.config.ts` imports. Recommend (b) for zero-friction stub authoring.
**Why:** A2 (2026-06-03 plan-eng-review) chose Next.js default no-trailing-slash URLs. WP serves `/park/<slug>/`. Without a 301 redirect for every park slug, every WP-indexed park URL becomes a "new" URL to Google and SEO equity resets. Critical for the 47 currently-live parks; equally critical for the 99 stubs as they're authored.
**Pros:** Auto-generation means stub parks get redirects without owner intervention. SEO equity preserved across the full directory lifecycle.
**Cons:** Build-time DB read adds ~50ms to `next.config.ts` evaluation. Build script needs the direct Drizzle client (not pooled) — minor wiring.
**Context:** Tied to A2 (plan-eng-review 2026-06-03). Phase 1 scaffolds the helper; phase 5 migration populates parks; subsequent builds emit correct redirects. Add a test that asserts every `parks.slug` has a corresponding redirect entry at build time.
**Depends on:** Phase 2 (Supabase + Drizzle) before generation can work; until then, hardcode the 47 in next.config.ts.

### Search Console + measurement plan
**What:** Add to launch checklist: verify domain in Search Console, baseline rankings for primary queries ('PA skateparks', '[city] skatepark', '[county] skateparks PA'), set weekly tracking, plus GA4/Plausible analytics setup decision (per D16).
**Why:** D6 list-first homepage is an SEO bet (per D19). Without measurement you can't tell if the bet paid off.
**Pros:** Closes the loop on the success criterion 'rank in Google within 90 days.'
**Cons:** ~2 hrs of setup.
**Context:** Tied to D16 analytics decision and D19 monitoring commitment.

---

## P2 — nice to have, defer to post-launch

### ~~Schema-sync tool for dev↔prod Airtable bases~~
**RETIRED by Supabase pivot (E3).** Drizzle migrations are git-committed SQL files applied identically to both dev and prod Supabase projects via `supabase db push`. No drift possible.

### Cost ceiling alerting
**What:** Set alerts on Supabase Storage (1GB free), Supabase DB size (500MB free), Vercel Image source-image count (1000/mo Hobby cap), Upstash request count (10k/day free), Vercel bandwidth (100GB/mo free).
**Why:** Surprise bills or surprise 429s.
**Pros:** Caught before they're a surprise.
**Cons:** Each platform has its own alert config; Supabase free tier alerting is basic.
**Context:** Total cost target $0. Most likely first overage = Vercel Image source-image count in launch month (will need monitoring + possibly upgrade to pre-resized strategy from E2 option A if it bites).

### SLO for owner-fixing warning chips from /admin/lint
**What:** Decide policy on how long a malformed ParkLinks line can show in production with a warning chip before it auto-hides or escalates.
**Why:** Without an SLO, chips will ship to production and stay forever, becoming visual noise.
**Pros:** Forcing function for clean data.
**Cons:** Adds an automation rule.
**Context:** Suggest: chip is visible to all users for 7 days. After 7 days, render under "Other Links" silently OR drop with a /admin/lint flag. Owner gets a weekly digest email of new chips.

### Cloudinary fallback smoke test
**What:** Add a real integration smoke test (not MSW mock) that hits Cloudinary's transform endpoint with a known image and verifies the response.
**Why:** MSW can lie. Cloudinary's behavior on edge cases (broken upstream URL, transform error, quota exceeded) isn't trivially mockable.
**Pros:** Catches the class of bug that MSW hides.
**Cons:** Adds an external dep to one test; might be flaky.
**Context:** Run nightly or pre-deploy only, not on every PR.

### Nightly database backup
**What:** GitHub Action runs nightly `pg_dump` against the prod Supabase, encrypts the dump with `age` or `gpg`, commits to a private GitHub repo (or uploads to a free B2 bucket).
**Why:** Supabase free tier has 7-day backup retention with no point-in-time recovery. The owner spent months compiling this data — 7 days is not adequate disaster-recovery window.
**Pros:** True ownership of your data history. Free.
**Cons:** ~2 hrs to set up. Need to manage the encryption key carefully (losing it means losing the backups).
**Context:** Add to `.github/workflows/db-backup.yml` running daily. Encrypt with a passphrase stored only in the owner's password manager. Keep last 90 days of dumps in the private repo, rotate older.

### Supabase Studio owner workflow + MFA recovery
**What:** Document the owner's complete Supabase Studio access setup: account creation, MFA enrollment, MFA recovery codes saved offline, role assignment (Owner role on the org), invitation of a secondary admin (you or trusted other) so the bus-factor isn't 1.
**Why:** If the owner loses their MFA device, recovery requires Supabase support + proof of org ownership — could take days. A secondary admin can recover instantly. Critical for a one-person operation.
**Pros:** Bus-factor protection. Trivial to set up before launch.
**Cons:** Requires owner to actually save the MFA recovery codes (they always lose them — write the procedure clearly).
**Context:** Step-by-step in the project README. Pair-screen with the owner during launch prep to walk through it.

### Supabase RLS audit before launch
**What:** Before flipping DNS, manually verify that the Supabase publishable key (`sb_publishable_*`) cannot read or write any table except INSERT into `suggestions`. Run a script that exercises every table from a fresh anon-role client and asserts the expected error.
**Why:** RLS misconfiguration is the most common Supabase security incident. The defense-in-depth in E5 only works if it's actually configured.
**Pros:** Prevents the class of bug where the whole site's user emails leak via the publishable key.
**Cons:** ~1 hour of test-writing.
**Context:** Should run in CI nightly post-launch too. Worth a Playwright test that grabs `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and tries every table.

### Vercel Hobby commercial-use risk documentation
**What:** Document the decision to use Vercel Hobby (E1) despite the commercial-use clause (paskateparks.com funnels to coaching business). Plan: if Vercel ever asks, upgrade to Pro $20/mo (~$240/yr — still cheaper than the old WP setup).
**Why:** Decision should be retrievable later when someone asks "why aren't we on Pro?"
**Pros:** Captures the reasoning so it's not relitigated.
**Cons:** None.
**Context:** Add a one-paragraph note to the project README or CLAUDE.md so future-you doesn't have to reconstruct this from memory.

### Mobile-keyboard + Turnstile modal QA
**What:** Add Playwright test that opens Suggest-an-Edit modal on a mobile viewport, focuses the description field, verifies Turnstile iframe doesn't break the keyboard layout.
**Why:** Known minefield on iOS Safari + modal + 3rd-party iframe.
**Pros:** Catches a class of bug that desktop testing misses.
**Cons:** Playwright mobile emulation isn't perfect for iframe keyboard interaction.
**Context:** Worth a manual real-device test before launch even if the Playwright test passes.

---

## Deferred / out of scope (already captured by design doc)

- Park rating system (1-10 score) — explicitly parked in DESIGN.md Revisions "Deferred to future iterations"
- Embeddable widget — confirmed deferred in DESIGN.md
- Blog / Events content — out of scope per SITE-AUDIT §9 #5
- Printable "first visit" card — DESIGN.md UI Direction noted as out of scope
- Park rating, owner score, community reviews — DESIGN.md "Deferred to future iterations"
