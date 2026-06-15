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

### ~~410 page body~~
**LANDED 2026-06-15** (phase 9). `src/proxy.ts` + `src/lib/retired-urls.ts` return a 410 with a simple HTML body for `/builder/*` and `/shop/*` ("This page is permanently gone. [Browse parks](/) or [open the map](/map/).") plus `X-Robots-Tag: noindex,nofollow`. Covered end-to-end by `e2e/middleware-410.spec.ts` (16 tests across the 8 retired-builder/shop slugs, bare /builder + /shop, unknown sub-slugs, header check, and non-interception of /park/<slug>, /county/<slug>, /obstacle/<slug>).

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

### NearMeButton CLS — reserve placeholder slot
**What:** `src/components/home/NearMeButton.tsx` returns `null` on SSR (feature-detect lives in `useEffect`), then renders the real button after hydration. The filter-input row in `HomeParkList` reflows mid-paint — a visible CLS hit on the parking-lot 4G P0 case. Fix: render a fixed-width placeholder (`visibility: hidden`) sized to the longest label ("Find parks near me") during the unsupported / pre-hydration window, swap in the real button when `supported` flips true.
**Why:** Core Web Vitals (CLS) and perceived stability on the headline use case. Surfaced by the /codex performance specialist during phase 6 pre-landing review.
**Pros:** ~10 LOC. Real perceived-perf win. Doesn't affect SEO or behavior on supported browsers.
**Cons:** Touches a component that already passed its review — small re-test surface.
**Context:** Phase 6 D2 chose a single client island that gates the button on `useEffect(() => navigator.geolocation && setSupported(true), [])`. The slot reservation is independent of that gate.
**Depends on:** Nothing.

### Search Console + measurement plan
**What:** Add to launch checklist: verify domain in Search Console, baseline rankings for primary queries ('PA skateparks', '[city] skatepark', '[county] skateparks PA'), set weekly tracking, plus GA4/Plausible analytics setup decision (per D16).
**Why:** D6 list-first homepage is an SEO bet (per D19). Without measurement you can't tell if the bet paid off.
**Pros:** Closes the loop on the success criterion 'rank in Google within 90 days.'
**Cons:** ~2 hrs of setup.
**Context:** Tied to D16 analytics decision and D19 monitoring commitment.

### ~~Tile provider — migrate off OSM public tiles before launch~~
**LANDED 2026-06-08** (session 5). Swapped `MapView.tsx` to CARTO Positron (`https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`) + matching preconnect in `src/app/map/page.tsx`. Closed the OSM-policy risk AND the visual "too realistic / atlas-y" feel in one swap. No API key needed — CARTO's public basemap policy permits anonymous use up to ~75K mapviews/mo, which exceeds our P0 traffic expectation for launch. Attribution updated to credit both OSM contributors and CARTO. If we ever blow past the free tier, the same URL pattern keys via `?api_key=` (provisioned in the CARTO dashboard) — no architecture change.

### ~~Phase 9 webhook revalidate — taxonomy fan-out + REPLICA IDENTITY FULL~~
**LANDED 2026-06-15** (phase 9). `src/app/api/revalidate/route.ts` validates Bearer token + dispatches to `src/lib/revalidate-resolver.ts:resolvePaths` (extracted pure async function, 21 unit tests). Resolver also revalidates `/` and `/map/` on parks-table + photo changes (caught during T2 — spec missed it because phase 6/7 use `dynamic = "force-static"`). Migration `0004_replica_identity_full.sql` set REPLICA IDENTITY FULL on all 8 tables (not just parks + park_obstacles — serial-PK child tables don't expose `park_id` in old_record under DEFAULT, breaking DELETE fan-out). pg_class.relreplident = 'f' verified on all 8.

---

## P2 — nice to have, defer to post-launch

### parks.last_revalidated_at write-amp mitigation
**What:** Phase 9 ships with `/api/revalidate` bumping `parks.last_revalidated_at = now()` on every relevant webhook. With 8 Supabase Webhooks configured (one per table), a single Studio edit to one park can cascade up to 8 UPDATEs back to `parks`. A bulk-edit of 48 parks = ~384 writes. Switch to `UPDATE parks SET last_revalidated_at = now() WHERE id = $1 AND last_revalidated_at < now() - interval '60s'` (or `GREATEST(last_revalidated_at, now() - interval '60s')` pattern). Coalesces fanout-fire timestamps to one bump per 60-second window per park.
**Why:** Hobby DB tier (500MB) handles current write volume easily — but the pattern is cosmetic write amplification that scales poorly as the directory grows past 150 parks. Cleaner write profile + identical semantics for the `/admin/lint` stale-revalidate chip.
**Pros:** ~3 LOC + 1 unit test. Identical user-visible behavior. Cuts Supabase free-tier write volume in bulk-edit cases by ~8×.
**Cons:** Premature optimization at v1 scale (48 parks). If never bites, the change is just code churn.
**Context:** Phase 9 outside-voice CMT-11 (Claude adversarial). Mike chose 10A=A (defer to TODOS) so phase 9 ships with bump-on-every-webhook and the cosmetic mitigation lives here. Trigger to ship: when `/admin/lint` stale-revalidate chip starts false-firing (last_revalidated_at always fresh because of bulk-edit storms) OR Supabase free-tier write metrics climb past 70% of the 500MB DB ceiling.
**Depends on:** Nothing — pure refactor.

### ~~Schema-sync tool for dev↔prod Airtable bases~~
**RETIRED by Supabase pivot (E3).** Drizzle migrations are git-committed SQL files applied identically to both dev and prod Supabase projects via `supabase db push`. No drift possible.

### ~~/admin/lint orphan-county chip — surface parks whose county isn't in counties.ts~~
**LANDED 2026-06-15** (phase 9). `src/lib/lint-checks.ts:getOrphanCounties` runs `SELECT DISTINCT county FROM parks` and surfaces unresolved counties through the same chip dashboard. Ships alongside three other chips (stale revalidate >30d, missing coordinates, no photos) per 4A — all 4 chips shipped in v1. `getAllLintChips()` uses Promise.allSettled-style result so one failing query can't fail the whole dashboard.

### Tighten assertCountiesInData to detect Studio case/whitespace drift
**What:** `src/lib/counties.ts:assertCountiesInData` is whitespace + case tolerant (good for catching unknowns), but `src/lib/park-query.ts:getParksByCounty` does a case-sensitive `eq(parks.county, "Bucks")` lookup. If Studio data drifts to `"bucks"` or `"Bucks "`, the build assertion passes but the runtime query returns 0 rows → `/county/bucks` 404s with no signal. Extend the assertion to also throw on canonical-form mismatch (value present in map but not in exact case + trim form). Today's data is verified clean; this is a guard against future Studio edits.
**Why:** Surfaces the failure mode at build time instead of silently 404-ing one of 14 archives.
**Pros:** ~10 LOC + 1 test. Owner gets a loud build error pointing at the exact drift.
**Cons:** Existing "tolerates case + whitespace" test in counties.test.ts becomes "rejects drift" — minor rewording.
**Context:** Phase 8 ship-review P1 finding (Claude adversarial subagent). The orphan-county chip in `/admin/lint` (P2 above) would also surface this between deploys.
**Depends on:** Nothing.

### e2e JSON-LD parse validation
**What:** `e2e/taxonomy.spec.ts` checks JSON-LD presence via `toHaveCount(2)` + `toContain("ItemList")` — passes even if the JSON is malformed (e.g. empty `<script></script>` or broken structure). Parse each script body with `JSON.parse` and validate required schema.org fields (`@context`, `@type`, `itemListElement` length matches park count).
**Why:** Current assertions pass on shapes that wouldn't actually parse, missing real regressions.
**Pros:** ~15 LOC. Real contract verification.
**Cons:** None.
**Context:** Phase 8 ship-review P2 finding (Claude adversarial subagent).
**Depends on:** Nothing.

### Per-archive custom intro copy — 14 counties + 38 obstacles
**What:** Each `/county/<slug>` and `/obstacle/<slug>` archive currently uses a templated intro paragraph ("N open skateparks in X County, Pennsylvania, sorted alphabetically"). For SEO + reader value, replace with 1-3 sentences of owner-written copy per archive — local context for counties ("Philadelphia County is home to FDR, the most-photographed park in PA…"), trick context for obstacles ("Quarter pipes are the foundational ramp at most PA parks…").
**Why:** Per CMT-4A (phase 8 plan-eng-review outside voice / codex #9), the current templated copy is "thin-programmatic-page territory" — Google may flag and downrank if all 52 archives share the same shape. Custom intro copy materially improves snippet quality and ranking on "<obstacle> spots in PA" / "<county> skateparks" long-tail searches.
**Pros:** Direct SEO win on the queries phase 8 is built to capture. Adds content depth where Google rewards it.
**Cons:** Content work, not technical — ~5 min × 52 archives = ~4-5 hours owner time. Schema needs a new `archive_intro_copy` field (or a new `taxonomy_intros` table keyed by `(kind, slug)` for forward-compat with park_type / riding_surface archives).
**Context:** Phase 8 ships with the templated copy. JSON-LD + canonical + breadcrumb + 4 explicit 301s (CMT-2A, CMT-4A) are already in place — adding custom copy is the remaining SEO-depth win flagged in the codex review.
**Depends on:** Owner content workflow. Suggest: add to the Airtable-style Studio view as a free-text field per taxonomy. Render the field when present, fall back to templated copy when null.

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

**Status 2026-06-15:** RLS is now enabled on **every** public-schema table (12 of 12 — see `scripts/check-rls.ts` for the live audit). The Supabase critical email dated 2026-06-08 closed out: the miss was the `__paskateparks_migrations` tracking table that `scripts/db-migrate.ts` created inline before `0001_rls.sql` could touch it. Fixed in migration `0005_enable_rls_tracking.sql` + db-migrate.ts now enables RLS at CREATE-TABLE time. **Still pending:** the audit Playwright test that exercises the publishable key against every table from anon and asserts denial — that's the real "audit" work this entry was scoped for. Trigger to ship: when the publishable key actually goes into the browser bundle (phase 10 or whenever we add client-side Supabase calls).

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

### Homepage scaling breakpoint
**What:** Add a build-time warning in `getAllParksForHomepage()` (src/lib/park-query.ts) when the parks count exceeds 200. At 48 the client-serialized list is ~7KB; at 500 it would be ~75KB and the client-side sort+filter model starts hurting cold-load perf. When the warn fires, switch to either pagination/virtualization or a server-routed sort (`?near=lat,lng` query string with server-side sort).
**Why:** Owner clarification 2026-05-30: all 150+ parks will have profile pages once the 99 stubs are authored. Without a tripwire, the homepage payload grows silently past the comfortable zone.
**Pros:** Prevents silent perf regression. Trivial alert (~5 LOC), no implementation work yet.
**Cons:** None — measurement only.
**Context:** Surfaced by `/codex` outside voice during phase 6 plan-eng-review. The check sits in the same query function that already loads the data, so zero new code paths.
**Depends on:** Owner workflow for 99 stub parks (P1 above) determines when this trips.

---

## Deferred / out of scope (already captured by design doc)

- Park rating system (1-10 score) — explicitly parked in DESIGN.md Revisions "Deferred to future iterations"
- Embeddable widget — confirmed deferred in DESIGN.md
- Blog / Events content — out of scope per SITE-AUDIT §9 #5
- Printable "first visit" card — DESIGN.md UI Direction noted as out of scope
- Park rating, owner score, community reviews — DESIGN.md "Deferred to future iterations"
