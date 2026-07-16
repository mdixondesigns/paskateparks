# TODOs — PA Skateparks Rebuild

Captured by /plan-eng-review on 2026-05-30. Items the eng review surfaced but explicitly deferred or left as content/ops work.

**Updated after Supabase pivot** (STACK-PIVOT.md) — Airtable-specific items retired, two Supabase items added.

---

## P0 — launch blockers (target: this month)

Added 2026-07-07 per owner — these must be resolved before launch. Listed as captured; not yet scoped into What/Why/Pros/Cons.

### Small / medium

- ~~**About page needs real content.**~~ — DONE 2026-07-15 (owner-authored copy + contact links live at `/about`).
- **Consolidate the "helmet and pads" section on each park page.** — HELD 2026-07-13 after /plan-eng-review (not a launch blocker; leaving live site as-is). Proposal was: drop the structured `helmets`/`otherPadsRequired` columns + `helmets_policy` enum, move Park rules into a `<details>` accordion, and show a photo of the park's posted rules sign + free-text specifics. Outside voice killed it for launch: (1) there is **no admin park-editing UI and no owner→park/role model** (only `admin/lint` + `admin/login`; `profiles` = id/display_name/created_at), so `rulesSignPhotoPath` would ship **null for 100% of parks** — the sign photo can't be populated, which removes the entire rationale for dropping helmet data; (2) dropping the enum/columns is irreversible + needs a prod backfill script (a SQL migration can't call the TS `helmetsBackfillSentence()`), Drizzle snapshot regen, and ~9-file cleanup (`db-verify.ts` EXPECTED_ENUMS + count, `db-seed-fdr.ts`, `schema.test.ts`, `ParkProfile.test`/`Overview.test` inline fields, `migrate-wp/*`, `labels.ts`, fixtures, stories). **When revisited:** the reversible path is soft-deprecate (stop *rendering* helmets/pads, keep the data one release) + accordion, and it depends on first building an admin ingest path for the sign photo (ties into the deferred user/file-upload work, TODOS P1). Reverses DESIGN.md D16 — record the decision there if it proceeds.
- **Proper icons for the social + support links on each park page.**
- **`cursor: pointer` on all buttons.**
- **Improve the gallery presentation per park.**
- **Updated privacy policy with the correct contact email.**

### Big

- **Visitor accounts** — name + profile picture. **IN PROGRESS 2026-07-07:** v1 (email+password, display name, initials avatar) built per [docs/designs/user-accounts-v1.md](docs/designs/user-accounts-v1.md); profile-picture *upload* deliberately deferred (see P1 entry "Avatar file upload").
- **Anonymous + registered users suggest park edits, with an incentive layer** — owner wants to focus on incentives specifically: a leaderboard for submissions, point values for different kinds of contributed info.
- **Credit users who submit photos.**
- **"Favorite" parks** — scope still open; explore what favoriting should actually do (saved list, just a toggle, feeds the leaderboard/incentive system above, tied to accounts).

---

## P1 — should ship with v1 or shortly after

### Widen profiles SELECT policy when the leaderboard/photo-credit surface ships
**What:** `supabase/migrations/0007_profiles.sql` (user-accounts v1) restricts `profiles` SELECT to own-row (`auth.uid() = id`) per eng-review decision CM3 (2026-07-07). The leaderboard / photo-credit features need OTHER users' display names, so the policy must widen to public read in the same migration that ships that surface — plus the RLS-audit test updates to match.
**Why:** Without this tripwire, the leaderboard renders empty names and the failure looks like a data bug, not a policy decision made in July.
**Pros:** One-line policy change + one test update, shipped exactly when a product surface justifies the exposure.
**Cons:** None — deferred exposure was the point.
**Context:** Eng review of docs/designs/user-accounts-v1.md, outside-voice finding CM3. v1 exposes no display name to anyone but the owner of the row.
**Depends on:** The incentive/leaderboard P0 task.

### Avatar file upload (post-launch half of the accounts P0 item)
**What:** v1 accounts ship generated initials avatars only (decision D2, 2026-07-07). Real profile-picture upload: dedicated `avatars` Storage bucket, per-user-path RLS write policies, size/MIME caps mirroring the photos bucket (10MB; jpeg/png/webp), Sharp square-resize modeled on scripts/migrate-wp.ts, InitialsAvatar as permanent fallback.
**Why:** The owner's original launch-blocker ask was "name and profile picture" — this is the deliberately deferred picture half.
**Pros:** Cuts the entire user-file-upload attack surface from the launch-month build; upload lands later against a stable auth base.
**Cons:** Users who want a real photo wait for a follow-up release.
**Context:** docs/designs/user-accounts-v1.md "NOT in scope". The upload endpoint is the single riskiest surface accounts will ever add — build it unhurried.
**Depends on:** User accounts v1 shipped.

### ~~Global header with logo, site title, and nav~~ — DONE (stale entry)
**Resolved before 2026-07-07:** `src/components/site/SiteHeader.tsx` exists (wordmark + NavLinks), wired into layout.tsx with tests and a Storybook story. This entry had drifted stale — caught during the 2026-07-07 user-accounts eng review (same doc-drift pattern as the 99-stub-parks count). The user-accounts work added the Sign in / avatar item to NavLinks.

### Park profile breadcrumbs (back to listing)
**What:** /park/<slug> pages have no clear way back to the directory. Reuse the existing breadcrumb component pattern from `src/app/county/[slug]/page.tsx:113` (`<nav aria-label="Breadcrumb">` + `breadcrumbJsonLd` for SEO).
**Why:** Users land on a park profile (from search, social share, /map/ popup, or /county/<X>) and have no obvious "back to the directory" affordance besides the browser back button. Trust + IA gap; launch-blocking.
**Pros:** Reuses existing breadcrumb infrastructure — code, schema.org JSON-LD, ARIA labelling all already exist. Likely <30 LOC delta.
**Cons:** Breadcrumb format question: linear (`Home › <Park Name>`), county-rooted (`Home › <County> › <Park Name>`), or obstacle-aware (multi-tag — which one wins?). Linear is simplest and matches the user's mental model of "this is one park in the directory."
**Context:** Render between the (forthcoming) site header and the park's hero block. Schema.org BreadcrumbList JSON-LD piggybacks on the existing `breadcrumbJsonLd` helper.
**Depends on:** Nothing (county breadcrumb pattern can be lifted directly). Visually composes well once the SiteHeader lands.

### Alt-text strategy for migrated photos
**What:** Decide ownership for backfilling alt text on ~1500 photos migrated from WP. Auto-generated `"FDR Skatepark photo 3"` per D29 fails WCAG 1.1.1 meaningfully and is bad SEO snippet material.
**Why:** Accessibility compliance + Google image search. Audit confirmed 0/20 sampled WP photos have alt text.
**Pros:** Better screen-reader UX, eligibility for image-rich Google snippets, real accessibility win.
**Cons:** ~1500 photos × ~30s per alt text = ~12 hours of owner time. Not technical work.
**Context:** D29 already supports `Caption` and `Credit` on the Photos child table — alt text fits in there or a new `AltText` field. Render template should prefer `AltText`, fall back to `Caption`, fall back to auto-gen.
**Depends on:** D4 migration complete (need records to author against).

### /new-park/ form destination — docs/archive/SITE-AUDIT.md §9 #6
**What:** Find out where the existing /new-park/ submissions go (email? CRM? Airtable already?). Migrate the flow into the new Suggestions table (or a separate New Park Submissions table).
**Why:** If you don't ask the owner, you silently break a content-acquisition channel that's been running for years.
**Pros:** Preserves an existing inflow channel.
**Cons:** Requires owner interview + possibly a separate table.
**Context:** Owner conversation needed before launch. Likely splits into a separate Airtable table from Suggestions (different shape: name of new park + nominator contact vs. correction to existing park).

### Owner workflow for 111 stub parks
**What:** Give the owner a workflow to author the stub parks. Without it, "filled in over time" stays vague forever.
**Why:** This is the content debt you migrated, not a v2 thing. Without a workflow, stubs sit blank.
**Pros:** Owner has a clear path forward post-launch. Visible progress.
**Cons:** Owner-time intensive.
**Context:** Verified against the prod DB 2026-07-15: **111 of 159 parks (70%) are stubs** (no description AND no photos); 48 parks are filled. (The old "99 stubs" figure was stale and low; the count grew, not shrank.) This entry originally proposed an Airtable "Stubs to author" view — superseded by the in-app CMS decided in the 2026-07-15 CEO review (Approach B). The CMS should surface a "stubs to author" filter (`description IS EMPTY OR no park_photos rows`), sorted by name, with a % complete indicator.

### Redirect-table maintenance for /park/<slug>/ → /park/<slug>
**What:** Decide and implement how `next.config.ts`'s `redirects()` block stays in sync as new parks are authored. Options: (a) hardcoded list updated by hand, (b) build-time script `scripts/generate-redirects.ts` reads the `parks` table and emits a generated JSON that `next.config.ts` imports. Recommend (b) for zero-friction stub authoring.
**Why:** A2 (2026-06-03 plan-eng-review) chose Next.js default no-trailing-slash URLs. WP serves `/park/<slug>/`. Without a 301 redirect for every park slug, every WP-indexed park URL becomes a "new" URL to Google and SEO equity resets. Critical for the 48 currently-filled parks; equally critical for the 111 stubs as they're authored.
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

### Homepage park-list filters
**What:** A row of toggle chips above the search input on `/` for filtering parks by structured facets: amenities (Lit, Indoor, Restrooms, Parking, Free), surface (Concrete, Wood, Asphalt), obstacles/features (Bowl, Vert, Street, Rails). Click toggles; multi-select AND-filters the list. No dropdowns, no facet counts, no clear-all button — chips toggle themselves.
**Why:** Free-text + distance-sort exist today; the structured facets in `park_obstacles`/`park_amenities`/`park_riding_surfaces` are invisible. A parent asking "where can I take a 7-year-old after dark" (Lit + not-Vert) has no affordance.
**Pros:** ~80 LOC. All filterable data already in the schema. Reuses the same filter-then-sort pipeline at `HomeParkList.tsx:113`.
**Cons:** Value compounds with content fill-in — today most parks return on most queries because the 111 stubs lack amenity/obstacle rows. Filtering looks anemic until that content lands.
**Context:** Owner needs to pick the 4-6 chips that matter most for v1 (taste call, not a code call). Probably "Lit", "Bowl", "Indoor", "Free" to start. Look at the existing distance-sort + filter test at `HomeParkList.test.tsx` for the composition pattern to extend.
**Depends on:** Owner triage of which chips ship.

### Search Console + measurement plan
**What:** Add to launch checklist: verify domain in Search Console, baseline rankings for primary queries ('PA skateparks', '[city] skatepark', '[county] skateparks PA'), set weekly tracking, plus GA4/Plausible analytics setup decision (per D16).
**Why:** D6 list-first homepage is an SEO bet (per D19). Without measurement you can't tell if the bet paid off.
**Pros:** Closes the loop on the success criterion 'rank in Google within 90 days.'
**Cons:** ~2 hrs of setup.
**Context:** Tied to D16 analytics decision and D19 monitoring commitment.

---

## P2 — nice to have, defer to post-launch

### Wire hero panorama (parks.hero_photo_path) into the admin photo UI
**What:** `parks.hero_photo_path` shipped 2026-07-13 (migration `0008_add_hero_photo_path.sql`) so the hero band can show a purpose-shot panorama distinct from the gallery/map thumbnail. `HeroBlock` uses it when set and falls back to the first gallery photo when null. Right now it can only be populated by hand (upload the image to the `photos` bucket, run the Sharp 3-width resize, set the path via seed/SQL), so every park currently renders the fallback.
**Why:** Gives the hero its own image without the gallery lead and hero being the same photo. Inert until content + an ingest path exist.
**What's left:** When the admin photo-upload UI is built (same UI that would populate the deferred rules-sign photo — see the held helmet/Park-Rules item in P0), add a "hero panorama" slot that uploads + resizes + sets `hero_photo_path`. No schema work remains; this is purely the ingest surface.
**Depends on:** An admin park-editing / photo-upload UI (does not exist yet — only `admin/lint` + `admin/login`). Ties into the deferred user/file-upload attack-surface work (P1 "Avatar file upload").

### Park modal: prev/next park navigation (←/→ inside modal)
**What:** Inside the park-detail intercept modal, support ←/→ keys (and on-screen prev/next buttons) to browse to the next/previous park without closing the modal. Navigation respects the list's current sort (nearest-by-userLocation, mapCenter, or alphabetical) so the cohort feels coherent.
**Why:** Deferred from the park-modal CEO review (D3.2). The intercept-route pattern shipped first so we could observe demand before adding nav. Compounds with `mapCenter` sort — a parent scanning parks in the western PA cluster could ←/→ through them without re-opening the list. Matches Zillow/Airbnb pattern.
**Pros:** Higher-velocity browsing for users with intent ("show me the next nearby"). One additional small affordance on top of the modal we just shipped.
**Cons:** Adds state plumbing: modal needs to know the ordered cohort. Either ModalShell reads from SyncedMapList (cross-tree), or the cohort gets serialized into URL query params (uglier URL but cleaner ownership). Modal-to-modal navigation isn't free: <dialog>.showModal() makes the background inert, so swapping the modal's content via router.replace is fine, but the URL+modal+focus dance needs E2E coverage.
**Context:** Plan-mode locked in docs/designs/park-modal.md (D3.2). The simpler implementation: ModalShell receives a `cohort: ParkRef[]` + `currentIndex` prop and renders prev/next buttons that `router.replace('/park/<next-slug>')`. The intercept route catches the replace and re-renders with the new park's data. Effort: M (~half day with E2E).
**Depends on:** Park modal v1 (this branch).

### Park modal: focus return to the triggering card on close
**What:** When the user closes the park-detail intercept modal, focus returns to the list card / marker / popup link that opened it (rather than falling to `<body>` per native `<dialog>` close behavior). Keyboard users can then tab to the next card without leaving their place in the list.
**Why:** Deferred from the park-modal review (D5.1). The "ideal" capture-trigger-and-restore needs either a render-context that survives navigation (a React context bridging SyncedMapList and ModalShell) or sessionStorage as a side channel. Neither is large work but both are touchier than the v1 close-to-body default.
**Pros:** Accessibility win — keyboard users get continuity. Matches the focus-return contract `<dialog>` would offer if it weren't being unmounted by the route.
**Cons:** Adds cross-component state coordination (or a small global). Modal-mounting is per-route, so the trigger element identity has to survive the route change — sessionStorage is the cleanest source.
**Context:** Plan-mode locked in docs/designs/park-modal.md (D5.1). Approach: on card click, write `lastClickedParkId` to sessionStorage; on ModalShell unmount, read it and `document.querySelector('[data-park-id="X"] a')?.focus()`. Effort: S (~1 hour + a11y test).
**Depends on:** Park modal v1.

### Park modal: open/close animation (fade + slide)
**What:** Smooth fade-in/scale-up on open, fade-out on close, instead of v1's instant appearance. Honors `prefers-reduced-motion`.
**Why:** Deferred from the park-modal review (D5.2). v1 ships no animation because `<dialog>[open]` toggles `display:none` which short-circuits CSS transitions; a real animation needs `@starting-style` + `transition-behavior: allow-discrete`, which Safari < 17.5 silently ignores (acceptable degradation, but only after we're confident the rest of the modal is stable).
**Pros:** Polish; the visual transition reinforces "this is layered over the homepage" rather than "the page just changed".
**Cons:** CSS-feature-gated by Safari version. The progressive enhancement is fine (older Safari sees instant open) but needs cross-browser screenshot QA.
**Context:** Plan-mode locked in docs/designs/park-modal.md (D5.2). Effort: S (~1 hour CSS + screenshot pass).
**Depends on:** Park modal v1.

### Park modal: compact ParkSummary view (desktop alternative to full ParkProfile)
**What:** If the full 16-section `ParkProfile` feels cramped inside the desktop modal's max-w-2xl × 90dvh frame, build a `<ParkSummary>` variant that surfaces only the high-signal sections (hero photo, name, location, amenities, photos, NearMeButton to standalone) and drops everything else. Modal renders summary; standalone /park/<slug> still ships the full profile.
**Why:** Plan-mode call (D6.4): ship the full ParkProfile in v1 and observe. If desktop feels cramped after some real use, this is the followup. The compact view is also a natural step toward modal-to-modal navigation since less content makes prev/next more useful.
**Pros:** Cleaner desktop modal experience; faster modal-content LCP. Doesn't reduce SEO surface (standalone still has the full profile).
**Cons:** Two ParkProfile shapes to maintain. Risks the "modal shows less than the page" surprise — users hitting the modal and wanting the full thing would need an explicit "Open full profile" affordance.
**Context:** Plan-mode locked in docs/designs/park-modal.md (D6.4). Decision criterion: ship v1 with full ParkProfile, judge after one week of usage. Effort: M (~half day to extract the summary + design the affordance to expand to full).
**Depends on:** Park modal v1 + usage signal.

### `<DirectoryShell>` reusable component for /county + /obstacle archives (D3.2)
**What:** Extract the synced map+list layout on `/` (`SyncedMapList.tsx` wrapper composing `HomeParkList` + `MapView` with shared URL/bbox/selectedParkId state) into a `<DirectoryShell parks={...}>` component, then drop it into `/county/[slug]/page.tsx` and `/obstacle/[slug]/page.tsx`. Each archive becomes a scoped synced view (parks limited to the taxonomy).
**Why:** D3.2 was deferred so the synced-pane pattern could prove itself on `/` first. Three duplicated layouts on the production homepage + 14 county archives + 38 obstacle archives is the moment to abstract — but only AFTER the prototype is real and the edge cases are caught.
**Update 2026-07-06:** the sync model on `/` changed from sort-only (Plan A, shipped 2026-06-22) to automatic bbox-filtering — the list now always shows exactly the parks whose coordinates fall within the map's visible bounds. Parks without coordinates are EXCLUDED from the synced list (matching the map's own behavior — see the "Wherehouse54" entry above, the one park this currently affects). Whoever picks up this extraction should generalize the CURRENT bbox-filter behavior, not the stale sort-only model this note originally described.
**Pros:** One layout component to maintain. Consistent visual + interaction model across the directory. Taxonomy archives get the bbox-filter + URL-share affordances for free.
**Cons:** Premature abstraction risk — if the homepage and the archives diverge in subtle ways (different empty states, different counts, different fitBounds defaults), the shell either grows props for every variant or splits back into siblings. Hold for one production cycle on `/` first.
**Context:** Phase 10 D3.2 (eng review, 2026-06-22). Effort: L (probably 2-3 days — extract the wrapper, parameterize the data source, migrate 2 routes, write archive-flavored e2e). The current SyncedMapList does enough state lifting that the boundary is mostly clean; the real work is data-source parameterization and the archive intro-copy block above the synced shell.
**Depends on:** `/` synced layout shipping (this task block).

### Park photo lightbox / thumbnail expansion
**What:** The horizontal photo strip on /park/<slug> (`src/components/park/PhotoStrip.tsx`) renders thumbnails but clicking one does nothing. Wire each thumbnail to open a modal/lightbox with the full-resolution version, keyboard-navigable (←/→ between photos, Esc to close), with caption + credit if present.
**Why:** Without expansion, the thumbnails read as decoration rather than browseable content. Skateparks are a visual product — parents and skaters want to actually see the park before driving 40 minutes.
**Pros:** Significant UX upgrade for the photo-heavy parks (FDR has the most-photographed park in PA per CMT-4A). Implementations are well-understood — many ready-made libraries.
**Cons:** New dependency OR client-side complexity. Mobile lightbox UX (pinch-to-zoom, swipe between, body-scroll-lock) has known gotchas. Adds JS bundle weight to /park/<slug>, which is the LCP-sensitive page.
**Context:** Three options ranked by effort: (1) HTML5 `<dialog>` element + a small client component, ~50 LOC, zero deps, basic UX (no swipe between, no pinch-zoom). (2) `react-photo-album` or `yet-another-react-lightbox` — opinionated, ~30KB gz, full-featured. (3) Headless UI (`@headlessui/react Dialog`) + custom — middle ground. Given we ship Tailwind already and Headless UI is the canonical Tailwind partner, (3) is the natural fit. Caption + credit fields are already on `park_photos` per D29.
**Depends on:** Nothing.

### Homepage shows "Showing N parks" by default (not just after geolocation)
**What:** `src/components/home/HomeParkList.tsx:148-154` computes a status string that's only non-empty after the user grants geolocation ("Showing 45 parks nearest to you.") OR types in the filter input ("Showing 12 parks matching 'philly'."). With neither — the default page-load state — the status is `""`, so users get no count signal at all. Add an else branch: `\`Showing ${countLabel}.\`` (e.g., "Showing 150 parks.").
**Why:** Friendly orientation — users see "Pennsylvania has 150 skateparks, here's all of them" before they decide to filter or sort. Currently the page just shows the list with no header context, which feels incomplete. Also reinforces the directory's scale (150+ parks is the value prop).
**Pros:** ~3 LOC change at `HomeParkList.tsx:152` (replace the `""` fallback). No new components, no design questions.
**Cons:** Status visually duplicates information the user can also infer from the list length. But "150 parks" as a number lands faster than visually scanning the rendered card count.
**Context:** Use the existing `pluralize(items.length, "park")` helper one line up. Should the count change when filter is active but no location? It already does ("Showing 12 parks matching '...'."). The only gap is the no-filter + no-location case. Existing test at `HomeParkList.test.tsx:164` covers the geolocation branch — extend with a "no location, no filter" assertion.
**Depends on:** Nothing.

### parks.last_revalidated_at write-amp mitigation
**What:** Phase 9 ships with `/api/revalidate` bumping `parks.last_revalidated_at = now()` on every relevant webhook. With 8 Supabase Webhooks configured (one per table), a single Studio edit to one park can cascade up to 8 UPDATEs back to `parks`. A bulk-edit of 48 parks = ~384 writes. Switch to `UPDATE parks SET last_revalidated_at = now() WHERE id = $1 AND last_revalidated_at < now() - interval '60s'` (or `GREATEST(last_revalidated_at, now() - interval '60s')` pattern). Coalesces fanout-fire timestamps to one bump per 60-second window per park.
**Why:** Hobby DB tier (500MB) handles current write volume easily — but the pattern is cosmetic write amplification that scales poorly as the directory grows past 150 parks. Cleaner write profile + identical semantics for the `/admin/lint` stale-revalidate chip.
**Pros:** ~3 LOC + 1 unit test. Identical user-visible behavior. Cuts Supabase free-tier write volume in bulk-edit cases by ~8×.
**Cons:** Premature optimization at v1 scale (48 parks). If never bites, the change is just code churn.
**Context:** Phase 9 outside-voice CMT-11 (Claude adversarial). Mike chose 10A=A (defer to TODOS) so phase 9 ships with bump-on-every-webhook and the cosmetic mitigation lives here. Trigger to ship: when `/admin/lint` stale-revalidate chip starts false-firing (last_revalidated_at always fresh because of bulk-edit storms) OR Supabase free-tier write metrics climb past 70% of the 500MB DB ceiling.
**Depends on:** Nothing — pure refactor.

**Update 2026-06-15:** The recursive loop side-effect of this write pattern surfaced in production within 2 minutes of enabling the parks webhook — `/api/revalidate` writes `last_revalidated_at` → fires parks UPDATE webhook → re-enters resolver → writes `last_revalidated_at` → loop at ~1 req/sec. Fixed in `src/lib/revalidate-resolver.ts:onlyLastRevalidatedAtChanged` (short-circuit when only that column differs between old_record and record). The recursion is dead, but every legit revalidate still triggers one extra self-fire that the guard catches and discards. The 60-second-window mitigation above would eliminate that extra round-trip too; revised trigger to ship is "if Vercel /api/revalidate invocation count grows visibly larger than user-driven edits, indicating the loop-guard is firing too often."

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

### Wherehouse54 (Lancaster) is missing coordinates
**What:** Geocode Wherehouse54's address and add `lat`/`lng` to its database record.
**Why:** `pnpm db:check-coords` confirms it's the ONLY park (of 159) in the database currently missing coordinates. It doesn't appear on the map, and as of the 2026-07-06 automatic bbox-filter change, it also doesn't appear in the homepage's synced list (it's still reachable via `/county/lancaster`, relevant `/obstacle/*` archives, and direct URL). Note: the "Owner workflow for 111 stub parks" entry is about content authoring, not coords — the owner has clearly been geocoding stubs over time, and only this one park remains without coords.
**Pros:** Trivial fix — one address lookup + one DB update — that eliminates the gap at the source instead of requiring ongoing code accommodation.
**Cons:** Requires confirming the business's actual address and writing to the production database (a live-data change, done deliberately and separately from code changes).
**Context:** Surfaced by the 2026-07-06 `/plan-eng-review` outside-voice (Codex) pass while reviewing the automatic bbox-filter plan — the plan's original fix assumed ~99 parks lacked coordinates (per the stale entry above) and built more architecture than needed; checking `pnpm db:check-coords` against live data found only this one.
**Effort:** S (~10 min once the address is confirmed).
**Priority:** P2.
**Depends on:** Nothing.

### Cold load with a URL-supplied viewport briefly shows the unfiltered list (mobile always, desktop as a brief flash)
**What:** `/` shows the full unfiltered park list until the map has mounted and fired its first `moveend` — there's no live Leaflet instance (and therefore no real map bounds) before then. A shared URL like `/?lat=X&lng=Y&zoom=Z` therefore renders the FULL list for a moment before narrowing, even though the URL implies a specific area of interest. On **mobile** this persists indefinitely until the user taps "Map" (no live map exists at all pre-tap). On **desktop** the map mounts immediately, so the gap is usually a sub-frame flash (`animate:false` makes the init + first moveend land in the same effect flush) — worse on slow connections where `MapView`'s lazy-loaded JS chunk takes longer to arrive.
**Why:** Someone sharing a deep-link to "parks near this spot" would expect the list to already be scoped to that URL's area from first paint, not flash the full list first.
**Pros:** Closes a real (if narrow, and on desktop usually imperceptible) inconsistency between what the URL implies and what first paint shows.
**Cons:** Requires reimplementing Leaflet's center+zoom-to-bounds projection math independently of Leaflet itself (since it needs to run before Leaflet mounts) — meaningfully more complex and more error-prone than the edge case it solves, for a URL-sharing pattern not yet confirmed to be common.
**Context:** Originally surfaced mobile-only by the 2026-07-06 CEO review's outside-voice (Codex) pass on the automatic bbox-filter plan, then widened to desktop by the `/ship` red-team review the same day, which confirmed the identical root cause (`mapBounds` starts `null` until the first `moveend`) applies on both platforms — just with different practical severity. Explicitly deferred both times rather than folded into that PR, to avoid reopening its already-settled scope with unproven-value complexity.
**Effort:** S (human: ~2-3h / CC: ~30min).
**Priority:** P2.
**Depends on:** Nothing — lower priority until URL-sharing usage is actually observed.

### Homepage scaling breakpoint
**What:** Add a build-time warning in `getAllParksForHomepage()` (src/lib/park-query.ts) when the parks count exceeds 200. At 48 the client-serialized list is ~7KB; at 500 it would be ~75KB and the client-side sort+filter model starts hurting cold-load perf. When the warn fires, switch to either pagination/virtualization or a server-routed sort (`?near=lat,lng` query string with server-side sort).
**Why:** Owner clarification 2026-05-30: all 159 parks will have profile pages once the 111 stubs are authored (verified 2026-07-15). Without a tripwire, the homepage payload grows silently past the comfortable zone.
**Pros:** Prevents silent perf regression. Trivial alert (~5 LOC), no implementation work yet.
**Cons:** None — measurement only.
**Context:** Surfaced by `/codex` outside voice during phase 6 plan-eng-review. The check sits in the same query function that already loads the data, so zero new code paths.
**Depends on:** Owner workflow for 111 stub parks (P1 above) determines when this trips.

---

## Deferred / out of scope (already captured by design doc)

- Park rating system (1-10 score) — explicitly parked in DESIGN.md Revisions "Deferred to future iterations"
- Embeddable widget — confirmed deferred in DESIGN.md
- Blog / Events content — out of scope per docs/archive/SITE-AUDIT.md §9 #5
- Printable "first visit" card — DESIGN.md UI Direction noted as out of scope
- Park rating, owner score, community reviews — DESIGN.md "Deferred to future iterations"
