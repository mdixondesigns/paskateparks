# Stack Pivot: Airtable → Supabase

Decision recorded 2026-05-30 by /plan-eng-review.
**Supersedes** the Airtable-related architecture decisions (D1, D7, D8, D9, D10, D14, parts of D15 and D18) in DESIGN.md and the prior session log.

## Why

The original Airtable-centric plan accumulated 7+ workaround decisions to compensate for Airtable's limits as a public-website CMS:
- D1 Cloudinary mirror (Airtable URLs expire ~2h)
- D7 lenient parsers + `/admin/lint` (Airtable has no structured multi-field link records)
- D9 flat 21-field amenity model (Airtable child tables are awkward to author)
- D10 dev/prod base separation + schema-drift TODO (Airtable has no migrations)
- D14 retry wrapper (Airtable rate limits at free tier)
- D15 single-pass migration ordering (URL expiry coordination)
- D18 revalidation observability (the whole pipeline is flaky)

Plus a missed cost reality: ~1,700 records (parks + photos + builders + shops + suggestions) blows Airtable's 1,000-record free-tier cap, requiring Team tier (~$240-480/yr) — more than the current WPEngine bill.

**Owner goal:** ~$0/yr operating cost, "use tools as meant," not feel hacky.

Supabase + Vercel + Drizzle is the standard modern Next.js content-site stack. Most of the workaround complexity above retires entirely.

## Final stack

| Layer | Choice | Why | Cost |
|---|---|---|---|
| Hosting | Vercel Hobby (E1) | Best Next.js DX, accept small commercial-use ToS footnote | $0 |
| Database | Supabase Postgres free tier | Real schema + migrations + RLS + Studio admin UI | $0 (500MB DB, 2 projects = dev + prod) |
| ORM / data layer | Drizzle (E3) | Type-safe queries, schema-as-code, edge-runtime compatible | $0 |
| Migrations | Supabase CLI (E3) | SQL files in git, `supabase db push` | $0 |
| File storage | Supabase Storage | Permanent URLs, S3-compatible | $0 (1GB free) |
| Image resize | Pre-resize at migration via Sharp (F2 — reverses E2) | Avoids Vercel Image transformation cap; reliable + $0 | $0 |
| Admin UI | Supabase Studio | Browser table editor, login-protected, drag-drop photo upload | $0 |
| Revalidation | Supabase Database Webhooks (E6) | Fire on INSERT/UPDATE/DELETE, built-in retry, POST to /api/revalidate | $0 |
| Suggestions | Vercel API route + secret key (`sb_secret_*`) + RLS deny-all-anon (E5) | Keep Turnstile + Upstash + honeypot in TypeScript, defense-in-depth via RLS | $0 (Upstash + Turnstile free tiers) |
| Map | Leaflet + Leaflet.markercluster (D12 carries) | OpenStreetMap tiles, no API key | $0 |
| Analytics | GA4 + cookie consent banner (D16 carries) | Free, requires banner | $0 |
| Domain | paskateparks.com (existing) | — | ~$15/yr (existing) |

**Total: ~$15/yr** vs current WPEngine + plugins ~$250/yr. **94% cost reduction.**

## Final schema (Postgres)

```sql
-- Enum types
CREATE TYPE park_status AS ENUM ('open', 'temporarily_closed', 'permanently_closed');
CREATE TYPE park_type   AS ENUM ('concrete_park', 'diy_park', 'indoor_park', 'prefab_park', 'skate_plaza');
CREATE TYPE helmets_policy AS ENUM ('none_posted', 'recommended', 'required_under_12', 'required_all_ages');
CREATE TYPE riding_surface AS ENUM ('concrete', 'asphalt', 'wood', 'other');
CREATE TYPE link_type AS ENUM (
  'website', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok',
  'gofundme', 'venmo', 'patreon', 'donate', 'givebutter', 'paypal', 'other'
);
CREATE TYPE amenity_type AS ENUM (
  'bathroom', 'drinking_water', 'lights', 'parking',
  'spectator_area', 'onsite_shop', 'equipment_rentals'
);
-- 38 obstacles from WP taxonomy (outside-voice finding #14: TEXT → enum prevents typos in Studio)
CREATE TYPE obstacle_type AS ENUM (
  'grind_box_ledge', 'quarter_pipe', 'flat_rail', 'bank_wedge', 'hubba',
  'manual_pad', 'funbox', 'hip', 'handrail', 'curb', 'pyramid',
  'kicker_launch_ramp', 'stair', 'wallride', 'mini_ramp', 'spine',
  'euro_london_gap', 'pool_bowl', 'extension', 'gap', 'roll_in',
  'volcano', 'jersey_barrier', 'a_frame', 'amoeba_pool', 'box_jump',
  'picnic_table', 'pole', 'rainbow_rail', 'escalator', 'full_pipe',
  'cradle_over_vert', 'snake_run', 'fire_hydrant', 'whoop_dee_doo',
  'foam_pit', 'mega_ramp', 'pump_track'
);

-- Core tables
CREATE TABLE parks (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status park_status NOT NULL DEFAULT 'open',
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PA',
  established_year INTEGER,
  park_type park_type,
  square_footage INTEGER,
  county TEXT,
  street_address TEXT,
  zip TEXT,
  -- Outside-voice finding #2: 99 stub parks don't have lat/lng yet. Owner must be able to save a stub.
  -- Render-time: parks with NULL lat/lng are excluded from /map/ and Nearby Parks/Shops, page still renders.
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  hours TEXT,
  description TEXT,
  allows_skateboards BOOLEAN NOT NULL DEFAULT TRUE,
  allows_bikes BOOLEAN NOT NULL DEFAULT TRUE,
  allows_roller_skates BOOLEAN NOT NULL DEFAULT TRUE,
  allows_scooters BOOLEAN NOT NULL DEFAULT TRUE,
  vehicle_rules_notes TEXT,
  helmets helmets_policy DEFAULT 'none_posted',
  other_pads_required BOOLEAN DEFAULT FALSE,
  fee BOOLEAN DEFAULT FALSE,
  programming BOOLEAN DEFAULT FALSE,
  riding_surface_notes TEXT,
  riding_surface_photo_path TEXT,
  -- Outside-voice finding #10: temporarily_closed needs reopen tracking to avoid stale banners
  status_changed_at TIMESTAMPTZ,
  reopen_expected_at DATE,
  wp_post_id INTEGER UNIQUE,  -- migration idempotency key
  last_revalidated_at TIMESTAMPTZ,  -- D18 observability
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE park_renovations (
  id SERIAL PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE park_riding_surfaces (
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  surface riding_surface NOT NULL,
  PRIMARY KEY (park_id, surface)
);

CREATE TABLE park_obstacles (
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  obstacle obstacle_type NOT NULL,  -- enum prevents typo-driven silent new obstacles
  PRIMARY KEY (park_id, obstacle)
);

CREATE TABLE park_amenities (  -- E4: child table not flat
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  type amenity_type NOT NULL,
  present BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  photo_path TEXT,
  PRIMARY KEY (park_id, type)
);

CREATE TABLE park_links (  -- replaces D7 free-text ParkLinks parser
  id SERIAL PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  type link_type NOT NULL,
  url TEXT NOT NULL,
  label TEXT,  -- e.g., "@fdrskatepark"
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE builders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,  -- finding #13: prevent duplicate "DIY" / "Spohn Ranch" silent inserts
  url TEXT,
  logo_path TEXT,
  wp_post_id INTEGER UNIQUE
);

CREATE TABLE park_builders (
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  builder_id INTEGER NOT NULL REFERENCES builders(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (park_id, builder_id)
);

CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  logo_path TEXT,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  state TEXT NOT NULL DEFAULT 'PA',
  wp_post_id INTEGER UNIQUE
);

CREATE TABLE park_photos (  -- D29 child table, in Postgres
  id SERIAL PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- e.g., 'parks/fdr/photo-01.jpg'
  credit TEXT,
  caption TEXT,
  alt_text TEXT,  -- TODOS P1 — owner backfills
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE suggestions (
  id SERIAL PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE RESTRICT,
  submitter_name TEXT,
  submitter_email TEXT,
  change_description TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new | in_review | applied | rejected
  -- Finding #11: storing raw IP is PII under GDPR. Truncate to /24 before insert in the API route.
  -- E.g., 192.168.1.5 → 192.168.1.0/24. Loses fingerprinting precision but keeps abuse-triage utility.
  submitter_ip_truncated CIDR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX parks_slug_idx ON parks(slug);
-- (finding #4: GiST on point(lng,lat) removed — haversine runs in Node at build time, index was unused)
CREATE INDEX park_photos_park_idx ON park_photos(park_id, sort_order);
CREATE INDEX park_links_park_idx ON park_links(park_id, sort_order);
CREATE INDEX park_amenities_park_idx ON park_amenities(park_id);

-- Row Level Security (finding #15: WITH CHECK clause adds defense-in-depth)
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
-- No policy for anon = anon has no access by default. service_role bypasses RLS.
-- The Vercel API route writes via service_role, BUT add a WITH CHECK policy that validates
-- park_id exists, so even if API has a bug, junk park_ids can't land:
CREATE POLICY suggestions_insert_valid_park ON suggestions FOR INSERT TO service_role
  WITH CHECK (EXISTS (SELECT 1 FROM parks WHERE id = park_id));
-- Read tables: parks, park_*, builders, shops — RLS disabled (server reads with service_role
-- at build time; no client-side reads of these tables).
```

### Schema notes (added after outside-voice review)

- **`parks.lat`/`lng` are NULL-able** (was NOT NULL). Required because 99 stub parks don't have coordinates yet — owner must be able to save a stub. Render code: parks with NULL coords are excluded from /map/ and from Nearby-Parks/Shops haversine, but the profile page itself renders.
- **`park_obstacles.obstacle` is enum, not TEXT.** Prevents typo-driven new obstacles in Studio. Adding a new obstacle = single `ALTER TYPE obstacle_type ADD VALUE` migration.
- **`builders.name` is UNIQUE.** Prevents duplicate "DIY" silent inserts. Migration script normalizes names (trim, casefold-compare) before insert.
- **`suggestions.submitter_ip_truncated` is CIDR with /24 truncation** (not raw INET). API route runs `inet '192.168.1.5' & inet '255.255.255.0'` before insert. Keeps abuse-triage signal without storing PII.
- **`parks.status_changed_at` + `reopen_expected_at`** added so temporarily-closed banners don't go stale forever.
- **GiST on `point(lng,lat)` dropped.** Haversine runs in Node at build time (one-time per build), index helps zero queries. If we ever push nearby-lookup into SQL via `earthdistance` extension, we'd add an `earth_box(...)` index instead.
- **Child-table re-run idempotency** (finding #9): the migration script deletes child rows then re-inserts inside a transaction per park, keyed off `parks.wp_post_id`:
  ```sql
  BEGIN;
  DELETE FROM park_links     WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_amenities WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_obstacles WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_renovations WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_riding_surfaces WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_photos    WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  DELETE FROM park_builders  WHERE park_id = (SELECT id FROM parks WHERE wp_post_id = $1);
  -- INSERT INTO parks ... ON CONFLICT (wp_post_id) DO UPDATE SET ...
  -- INSERT INTO park_links / park_amenities / etc with fresh values
  COMMIT;
  ```
  Migration is fully re-runnable per park.

### Runtime connection pooling (finding #5 — CRITICAL)

**Vercel serverless functions MUST use Supabase's pooler, not direct Postgres connection.** Direct connections on Supabase free tier cap at ~60; cold-start traffic blows past that. Two connection strings:

| Connection | Host | Port | Mode | When to use |
|---|---|---|---|---|
| Pooled (transaction) | `db.<project>.pooler.supabase.com` | `6543` | `?pgbouncer=true` | All `/api/*` routes, `/admin/lint`, anything in serverless runtime |
| Direct | `db.<project>.supabase.co` | `5432` | direct | Build-time RSC queries, migrations, the keepalive cron, the WP migration script |

Drizzle config: two clients, one per connection mode. Server components import the direct client; API routes import the pooled client.

### Webhook → revalidate slug resolution (finding #3 — CRITICAL)

Supabase Database Webhooks fire per-row with the row's payload. A `park_photos` INSERT carries `park_id` but NOT `slug`. `/api/revalidate` must accept any of the child-table payloads and resolve to the parent park's slug.

Pattern:
```ts
// /api/revalidate POST body shape from Supabase Webhook
// { type: 'INSERT'|'UPDATE'|'DELETE', table: 'parks'|'park_photos'|..., record: {...}, old_record: {...} }
const parkId = body.record.park_id ?? body.record.id  // child tables have park_id, parks has id
const { slug } = await db.select({ slug: parks.slug }).from(parks).where(eq(parks.id, parkId)).limit(1)
if (slug) {
  await revalidatePath(`/park/${slug}`)
  await db.update(parks).set({ last_revalidated_at: new Date() }).where(eq(parks.id, parkId))
}
```
Configure one Supabase Webhook per table (parks, park_links, park_amenities, park_renovations, park_obstacles, park_riding_surfaces, park_photos, park_builders), all POSTing to the same `/api/revalidate` endpoint. Webhook retry-on-5xx is built-in.

### `/api/revalidate` and `/admin/lint` auth (finding #6 — CRITICAL)

- **`/api/revalidate`**: shared-secret bearer token. Generate via `openssl rand -hex 32`, store as `REVALIDATE_SECRET` env var on Vercel, configure the same value in each Supabase Webhook's `Authorization: Bearer ...` header. Rotate annually or on suspected leak — rotation = generate new secret, update env var, redeploy, update webhook configs (~5 min).
- **`/admin/lint`**: Vercel-environment-protected. Use Vercel's Password Protection on the `/admin/*` path (Pro feature) OR a simple `Authorization: Bearer <ADMIN_TOKEN>` middleware check (Hobby-compatible). For Hobby + $0, the middleware check is fine: env var `ADMIN_TOKEN`, owner uses a bookmarklet that adds the header, or a simple login page that sets a signed cookie. Document the chosen approach.

### Free-tier project pause prevention (finding #1 — CRITICAL, per F1 decision)

Supabase free-tier projects pause after 7 days of zero activity. Mitigation locked in F1:

`.github/workflows/supabase-keepalive.yml`:
```yaml
on:
  schedule:
    - cron: '0 9 * * *'  # daily at 09:00 UTC
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS "https://${{ secrets.SUPABASE_HOST }}/rest/v1/parks?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}"
```
Both dev and prod projects pinged. Failure → GitHub sends email. ~10 seconds, $0.

## Architecture diagram

```
                ┌──────────────────────────────────────────────┐
                │              WordPress (sunset)               │
                │  - 47 parks + 99 stubs                        │
                │  - 14 builders, 20 shops                      │
                │  - 1500 photos in /wp-content/uploads/        │
                │  - lat/lng in WP Google Maps plugin tables    │
                └────────────────────┬─────────────────────────┘
                                     │ ONE-TIME (D4 staged pipeline)
                                     ▼
                ┌──────────────────────────────────────────────┐
                │       Migration script (Node + Drizzle)      │
                │  - WP DB dump → typed JSON                    │
                │  - Sharp: resize each photo to 3 sizes        │
                │  - Upload all sizes to Supabase Storage       │
                │  - INSERT into Postgres (idempotent by        │
                │    wp_post_id UNIQUE constraint)              │
                └────────────────────┬─────────────────────────┘
                                     │
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │              Supabase (PROD project, free tier)              │
   │  Postgres: parks, park_links, park_amenities,                │
   │            park_photos, park_renovations, park_obstacles,    │
   │            park_riding_surfaces, park_builders, builders,    │
   │            shops, suggestions                                │
   │  Storage:  parks/<slug>/photo-NN@WIDTHw.{jpg,webp}           │
   │  Studio:   owner login → table editor + storage browser      │
   │  Webhooks: row INSERT/UPDATE/DELETE → /api/revalidate        │
   └──┬─────────────────────────────────┬──────────────────┬─────┘
      │ webhook on save (E6)            │ build-time read  │
      │                                 │ (Drizzle + RSC)  │
      ▼                                 ▼                  │
   ┌─────────────────────┐    ┌──────────────────────┐     │
   │  /api/revalidate    │    │  Next.js build (RSC) │     │
   │  - verify secret    │    │  - Haversine in SQL  │     │
   │  - revalidatePath() │    │  - JOIN photos/links │     │
   │  - write timestamp  │    │  - Render templates  │     │
   │  /admin/lint        │    └──────────┬───────────┘     │
   └─────────────────────┘               │                 │
                                         ▼                 │
                          ┌──────────────────────────┐     │
                          │   Vercel Edge + CDN      │     │
                          │   /                      │     │ Supabase
                          │   /park/<slug>/          │◄────┘ Storage
                          │   /map/                  │       (signed-URL
                          │   /regions_and_counties/ │        via Storage)
                          │   /park_obstacles/       │
                          │   /api/suggestions       │       Vercel Image
                          │   middleware.ts → 410    │       resize layer
                          └──────────┬───────────────┘
                                     │
                                     ▼
                       ┌──────────────────────────────┐
                       │  Parent on Android in        │
                       │  parking lot (P0 use case)   │
                       └──────────────────────────────┘
```

## Decisions that carry over from the prior session

| # | Topic | Status |
|---|---|---|
| D2 | 410 middleware for retired URLs | Unchanged. middleware.ts with hardcoded 34 slugs. |
| D3 | Suggestions API pattern | Carries as E5 (Vercel API route + Turnstile + Upstash + RLS defense-in-depth). |
| D4 | Staged migration pipeline | Carries; target is Postgres COPY/INSERT instead of Airtable API. |
| D5 | Per-park revalidation | Carries as E6 (Supabase Webhooks → /api/revalidate, replaces Airtable Automation). |
| D6 | List-first homepage | Unchanged. |
| D11 | Vitest + Playwright + MSW | Unchanged. |
| D12 | Leaflet.markercluster | Unchanged. |
| D13 | next/image + priority + branded fallback | Unchanged (Cloudinary loader → Supabase Storage URL). |
| D16 | Privacy + GA4 + cookie banner | Unchanged. |
| D17 | Generate 52 taxonomy archive routes | Unchanged. |
| D18 | Revalidate observability | Unchanged shape, simpler implementation (Webhook retry replaces Airtable retry). |
| D19 | SEO monitor on D6 | Unchanged. |
| D20 | TODOS.md approval | Unchanged. |

## Decisions that retire

| # | Was | Status |
|---|---|---|
| D1 | Cloudinary mirror | RETIRED. Supabase Storage. |
| D7 | Lenient parsers + /admin/lint | RETIRED for parsers. /admin/lint stays for the D18 dashboard. Structured tables replace text fields. |
| D8 | Photos paginated fetch strategy | RETIRED. SQL JOIN at build. |
| D9 | Flat 21-field amenity model | RETIRED. Replaced by E4 `park_amenities` child table. |
| D10 | Two Airtable bases + scoped PATs | RETIRED. Replaced by two Supabase projects (dev + prod, free tier allows it) + Supabase secret / publishable key model (`sb_secret_*` / `sb_publishable_*` — the new API key system, replaces legacy anon/service_role keys) + RLS. |
| D14 | Airtable retry wrapper | RETIRED. Postgres has no rate limit. |
| D15 | Single-pass migration ordering | SIMPLIFIED. Sharp resize + Supabase Storage upload + Postgres INSERT happen in one script with no inter-system race. |

## New decisions locked

| # | Topic | Decision |
|---|---|---|
| E1 | Hosting | Vercel Hobby. |
| ~~E2~~ | ~~Image resize~~ | **REVERSED by F2** — see below. |
| E3 | Data layer | Drizzle ORM + Supabase CLI migrations. |
| E4 | Amenity model | `park_amenities` child table with enum type. |
| E5 | Suggestions write | Vercel API route + secret key (`sb_secret_*`) + RLS deny-all-anon. **Amended 2026-06-03 by /plan-eng-review (A8):** v1 ships with honeypot + RLS WITH CHECK only. Turnstile + Upstash deferred to v1.1 with trigger: ≥10 obvious-spam rows in `suggestions` within any rolling 7-day window. Rationale: 150-record directory, expected low submission volume, 3rd-party signup overhead unjustified at v1 scale, iOS Safari Turnstile+keyboard interaction (TODOS.md P2) avoidable for v1. **Amended 2026-06-03 (API key migration):** "secret key" / "publishable key" naming reflects Supabase's new API key system (`sb_secret_*` / `sb_publishable_*`) replacing the legacy anon / service_role keys. Legacy keys work through end of 2026 but can no longer be rotated. The Postgres *roles* `anon` and `service_role` remain — only the keys' user-facing names changed. |
| E6 | Revalidate trigger | Supabase Database Webhooks → /api/revalidate (with built-in retry). |
| F1 | Free-tier pause prevention | GitHub Actions daily `SELECT 1` keepalive (both dev + prod). |
| F2 | Image resize (replaces E2) | Pre-resize at migration via Sharp to 3 sizes (400w/800w/1200w JPEG via mozJPEG encoding), upload all to Supabase Storage, serve directly via `<img srcset>`. No Vercel Image dependency. **Amended 2026-06-06 (phase 5):** format flipped from WebP → JPEG. Rationale: owner-stated values prefer universal shareability (right-click-save into Photos / email / PowerPoint / old Photoshop "just works" with `.jpg`; `.webp` still chokes in iOS Photos <14 and Windows 7 default viewer) over the ~25% size win WebP would give. Measured perf cost on the parent-in-parking-lot P0 use case: ~70KB extra above-the-fold, ~0.3s LCP delta on mediocre 4G, ~0.5s on rural 3G — all comfortably under the 2.5s LCP budget. Storage budget moves from ~580MB to ~700MB of the 1GB Supabase free tier — still ~300MB headroom. Markup simplifies (no `<picture><source>` wrapper needed; plain `<img srcset>`). |
| F3 | WP cutover | Staged 5-day plan: T-72h lower DNS TTL to 300s → T-24h freeze WP + final sync → T-0 flip DNS + verify P0 paths + verify 410s → T+48h WP read-only → T+30d WP retire. |

## TODOS / TEST-PLAN updates

[TEST-PLAN.md](TEST-PLAN.md) — rewrite needed: mock targets change (no more Airtable mock, swap to Supabase test client; no more Cloudinary mock, swap to Supabase Storage fakes).

[TODOS.md](TODOS.md) — most items carry over with small adjustments:
- "Schema-sync tool for dev↔prod Airtable bases" → retire; Drizzle migrations are git-committed and applied identically to both projects.
- "Cost ceiling alerting" → simpler; Supabase usage dashboard is built in. Watch Storage (1GB), DB rows (500MB), and Vercel Image source-image count.
- New: "Supabase RLS audit before launch" — confirm anon role has zero read/write access to anything except where explicitly granted (suggestions INSERT only).
- New: "Vercel ToS — commercial use risk" — document the decision to use Hobby tier despite the commercial-use clause, with plan to upgrade to Pro $20/mo if Vercel ever asks.

## Final cost

| Item | Cost |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free (dev + prod projects) | $0 |
| Supabase Storage usage | $0 (~675MB of 1GB budget; see math below) |
| Upstash Redis Free | $0 |
| Cloudflare Turnstile | $0 |
| GA4 | $0 |
| GitHub Actions Free (keepalive cron) | $0 |
| Domain paskateparks.com | ~$15/yr (existing) |
| **Total** | **~$15/yr** |

vs. ~$250/yr current. **~$235/yr saved.** Hits the $0 operating-cost goal cleanly.

### Storage budget math (finding #8)

| Item | Count | Size each | Total |
|---|---|---|---|
| Park photos × 3 sizes (400w/800w/1200w WebP) | 1500 × 3 = 4500 files | ~120KB avg | ~540MB |
| Amenity photos (~3 per park × 7 amenities, mostly empty in v1) | ~50 × 3 sizes = 150 | ~120KB | ~18MB |
| Riding surface photos | ~50 × 3 sizes = 150 | ~120KB | ~18MB |
| Builder logos + Shop logos | ~34 single-size | ~50KB | ~2MB |
| **Total** | | | **~580MB** |

Fits 1GB Supabase Storage free tier with ~420MB headroom. If photo count grows past ~2200, time to either upgrade Supabase Storage (Pro tier $25/mo includes 100GB) or move to Cloudflare R2 (10GB free, no egress fees).

### First-month observability

Set Supabase project notifications to email when:
- Database size > 400MB (of 500MB free cap)
- Storage size > 800MB (of 1GB free cap)
- Egress > 4GB/mo (of 5GB free cap)
- MAU > 40K (of 50K free cap — won't hit this without auth)
