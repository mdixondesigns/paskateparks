# DESIGN.md — original plan (Problem Statement → Next Steps)

> **Archived 2026-07-03.** This is the original `/office-hours` output from 2026-04-25, before the site audit and the Supabase stack pivot. Split out of [DESIGN.md](../../DESIGN.md) because it describes an Airtable-based architecture the project no longer uses (confirmed: `package.json` has no Airtable dependency, `supabase` + `drizzle` are what's actually installed). The D1–D30 product decisions in DESIGN.md's "Revisions" section are still the live source of truth and were **not** touched by this archive — only the superseded original narrative below was moved out.
>
> Kept for "why did we start here" context, not as an active reference.

---

## Problem Statement

Pennsylvania has 150+ public skateparks. Most people — including people who live within 10 minutes of one — don't know they exist. The goal of this project is to make skateparks accessible through awareness.

The site serves three audiences:
1. **Parents** (primary) — looking for activities for their kids who are interested in skateboarding. They don't know what skateparks look like, whether they're safe, or whether there's one near them. The site must be welcoming to non-skaters.
2. **Core skaters** (secondary) — people who travel around to different parks, want a complete and detailed state-wide directory.
3. **Aspiring coaches / skate educators** (tertiary) — skaters or educators interested in becoming skateboarding coaches. Reached through a conditional coaching module on park profiles.

The site owner also runs a skateboarding coaching business. The directory is a trust-building resource that funnels parents to coaching programs and recruits future coaches.

## What Makes This Cool

The data is the moat. The owner spent months compiling a list of 150+ PA parks — nearly double the listings of the next largest resource. National apps (Smap, Ramp Map, Concrete Disciples) are built for skaters who already know what they want. This site flips that assumption: it's built for people who don't know options exist near them.

The "whoa" moment for a parent: they search "skateparks near Pittsburgh PA" and discover a free, public park 8 minutes from their house that their kid would love — with plain-English descriptions, a photo, helmet requirements, and one-tap directions.

## Constraints

- Rebuild of existing live site at paskateparks.com — no green-field, existing SEO and URL structure to consider
- Data management must be non-technical: 150+ parks need to be updated without code changes
- Primary device is mobile — a parent checking from their phone in a parking lot or at home
- Tone: simple, informative, welcoming to non-skaters. No skate jargon in UI copy.

## Premises

1. **The data is the moat.** 150+ parks, most complete PA listing. The design must showcase and protect it.
2. **This is a rebuild**, not net-new. paskateparks.com is already live.
3. **Serve both discovery and search.** Discovery: "I didn't know there was a park near me." Search: "I want to find a good park in Philadelphia." Both entry points matter — neither dominates.
4. **Tone welcoming to non-skaters.** If a parent can't figure it out in 10 seconds, it failed.

## Cross-Model Perspective

Second opinion (Claude subagent, builder mode):

> The coolest version not yet considered: a proximity engine — open the site, share location, see the nearest park in 3 seconds with a photo, whether it's lit, whether it has a bathroom, one-tap directions. No account, no friction. Plus a printable "first visit" card per park (what to expect, what to bring, beginner-friendly?). Embeddable widget for local news sites, tourism boards, school districts — "Skateparks near [town name]." That's free distribution without SEO.

> The one line that reveals what drives this: "nearly double the listings of the next largest resource." That's not a feature — it's an identity. They're not building a website, they're asserting that they are THE authoritative source on PA skateparks.

> 50% solution: Leaflet.js (free interactive maps, OpenStreetMap tiles, no API key) + Airtable (spreadsheet CMS for 150+ parks, read-only API). The 50% to build: park profile pages, proximity/geolocation feature, photo hosting, parent-friendly UX, SEO per park.

> Critical insight: server-side render the park data — don't client-side fetch it. If the map spins 4 seconds on an Android in a parking lot, the premise fails.

## Approaches Considered

### Approach A: Static-First (Ship This Week)
- JSON data file + Leaflet map + plain HTML
- Deploy to Netlify or GitHub Pages in an afternoon
- **Effort:** S (human: 2-3 days / CC: ~1 hour)
- **Risk:** Low
- **Pros:** Ships fastest. Zero infrastructure. Easy to hand off or open source.
- **Cons:** No individual park pages — bad for SEO. Updating data means editing JSON. Hard to layer in photos/filters later.

### Approach B: Next.js + Airtable + Leaflet
- App Router Next.js with static generation (ISR) per park — strong SEO, fast cold loads
- Airtable as spreadsheet-style CMS for park data management
- Leaflet map with OpenStreetMap tiles (Leaflet must be dynamically imported with `{ ssr: false }` — it requires `window` and will throw during SSR)
- Vercel deploy
- **Effort:** M (human: 1-2 weeks / CC: ~3-4 hours)
- **Risk:** Low
- **Pros:** Each park gets its own URL that ranks in Google for local searches. Data updated from Airtable — no code required. Static generation means fast load on mobile. Clean path to add photos, filters, profiles over time.
- **Cons:** More setup than Approach A. Airtable free tier has API rate limits — mitigated by fetching all parks in a single paginated list call at build time (not per-page fetches, which would hit the 5 req/sec limit).

### Approach C: Proximity-First PWA
- Progressive Web App with geolocation as the homepage
- Offline capable. Embeddable widget for school/township sites.
- **Effort:** L (human: 3-4 weeks / CC: ~6-8 hours)
- **Risk:** Med — PWA install prompts are inconsistent across iOS/Android. Widget maintenance adds scope.
- **Pros:** The parent experience is genuinely surprising — no searching required, just location. Organic distribution through embeds.
- **Cons:** Longest path to something shareable. More complexity than the problem requires at this stage.

## Recommended Approach

**Approach B: Next.js + Airtable + Leaflet + Vercel.**

SEO is non-negotiable — parents searching "skateparks near [city] PA" need to find individual park pages, not just a homepage. Airtable as the CMS keeps data management sustainable (update from a spreadsheet, no code edits). Static generation (ISR) ensures fast mobile load without per-request server overhead.

The "Near Me" geolocation button is in scope for phase 1 — it's a single client-side `navigator.geolocation` call that re-centers the map and sorts the park list. It doesn't change the architecture. Fallback when the user denies location permission: prompt manual city or zip code entry.

## UI Direction

Wireframe: `/tmp/paskateparks-wireframe.html` (session artifact — open in a browser to view; key decisions captured in this doc)

**Three screens designed:**

**Homepage:** Full-screen Leaflet map + sidebar park list. Hero copy above the map: "150+ skateparks across Pennsylvania. Find one near you." Search bar + "Near Me" button. Nav: All Parks / For Parents / About.

**Park Profile (standard):** Full-width single-column layout. Gallery (1/2/3 photo grid, click opens modal lightbox, "🔍 View all N photos" badge signals interactivity) → address/directions inline → features grid (material-first: Concrete / Wood / Asphalt, then Lighting, Helmets, Beginner ok, Cost) → plain-English description → nearby parks (3-column card grid).

**Park Profile (coaching-enabled):** Same layout with a narrow sidebar on the right containing a coaching module. The sidebar renders only when `Coaching` (boolean field) is set to `true` in Airtable — a manual flag the site owner sets per park. All other parks: no sidebar, full-width content. Coaching module has two CTAs: "Find a Coach →" (for parents) and "Skater or educator? Learn about becoming a coach" (for recruitment).

**Nearby parks algorithm:** 3 closest parks by Haversine distance within 30 miles of the current park. Computed at build time from the Airtable lat/lng fields and stored in the static page props. If fewer than 3 parks exist within 30 miles, show however many do.

**Missing data fallbacks:**
- No photos: render a styled placeholder (park name + city on a gray background, no broken image)
- No description: omit the "About This Park" section silently
- Missing lat/lng: exclude from the map; log a warning at build time so the owner knows which parks need geocoding
- No Coaching flag: default to `false` — full-width layout, no sidebar

**Mobile:** Hamburger menu preserves nav items. Search field + "Near Me" button in the body above the map. Park selection opens a bottom sheet containing: park name, distance from user location (or city), material tags, and two CTAs — "Get Directions" (opens native maps app) and "View Park Details →" (navigates to the full profile page).

**Gallery layout rules:**
- 1 photo: single image, full width, 240px tall
- 2 photos: side-by-side, equal width, 200px tall
- 3 photos: large image on left spanning full height (2fr), two stacked images on the right (1fr each)
- Clicking any image opens a modal lightbox — recommend `yet-another-react-lightbox` (small, accessible, maintained). "🔍 View all N photos" badge overlaid on the bottom-right corner of the gallery.

**Printable "first visit" card:** Out of scope for this rebuild. Revisit if the coaching business has a use for it.

**Tag design:** Material-specific tags surfaced on park cards and profiles (Concrete, Wood ramps, Asphalt, Bowl, Street section) — not generic "Free" / "Outdoor" which apply to 90%+ of parks. Parent-specific info (Beginner ok, Helmets required, Lit at night) surfaced alongside material tags.

**"New to Skateparks" block:** Lives on For Parents and About pages only — not on park profiles.

## Open Questions

1. **URL structure + SEO migration:** Does the existing paskateparks.com use URL slugs for parks? If yes, they must be preserved in the Next.js rebuild to protect existing search rankings. If URLs change, add 301 redirects from old to new paths in `next.config.js`. Also needed at launch: `robots.txt` allowing all crawlers, `sitemap.xml` listing all park URLs, and `<link rel="canonical">` on every park page.
2. **Photo hosting:** Where do park photos live? Airtable attachments field works at low volume but has size limits. Consider Cloudinary or an S3 bucket as photo scale increases.
3. **Geocoding:** Are all 150+ parks already geocoded (lat/lng)? If not, a one-time geocoding pass (Google Geocoding API or Nominatim) is needed before the map can render them.
4. ~~**Coaching flag:**~~ Resolved — manual flag (`Coaching` boolean) set by site owner per park in Airtable. Default: false.
5. **Airtable vs. existing CMS:** Does the current paskateparks.com already have a data store (WordPress, Webflow, spreadsheet)? The import path from existing data to Airtable needs to be planned.
6. **Embeddable widget:** Out of scope. Design in a future session if the need is validated.

## Success Criteria

- All 150+ parks visible on the map at launch
- Individual park pages rank in Google for "[city] skatepark Pennsylvania" within 90 days
- A parent can find their nearest park and get directions in under 30 seconds on mobile
- Park data can be updated in Airtable without a code deploy
- Coaching module visible and functional on specified parks

## Distribution Plan

- **Web service** hosted on Vercel (auto-deploy on merge to main)
- **Domain:** paskateparks.com (existing, transfer DNS to Vercel)
- **Data pipeline:** Airtable → Next.js on-demand ISR via Vercel deploy hook. All 150+ parks fetched in a single paginated list call at build time (not per-page fetches). Revalidation model: on-demand ISR using `revalidatePath` triggered by a Vercel deploy hook URL — Airtable automation POSTs to `https://api.vercel.com/v1/integrations/deploy/<hook-id>` on every record save. Time-based fallback: `revalidate: 3600` (1 hour). Changes go live within minutes of an Airtable save.
- **Airtable API key:** Stored as a Vercel environment variable (`AIRTABLE_API_KEY`). Never exposed client-side — all Airtable fetches happen at build time in `generateStaticParams` / `generateMetadata`, not in client components.
- **Airtable record ceiling:** Free tier allows 1,000 records per base. At 150 parks this is fine. If the scope ever expands beyond PA, migrate to a paid tier before hitting the limit to avoid silent data truncation at build time.
- **CI/CD:** Vercel's built-in GitHub integration — push to main triggers deploy

## Next Steps

1. ✅ **Audit existing paskateparks.com** — completed 2026-05-30. Results in [SITE-AUDIT.md](SITE-AUDIT.md) (same archive folder). Key findings: WordPress with 3 custom post types (`park`, `builder`, `shop`), `/park/<slug>/` URL pattern, 47 of 146 parks fully built out (the other 99 represent content debt, not a different tier), 38 obstacle taxonomy terms, 8 schema fields not in the original design.
2. **Import park data to Airtable** — create a base with the following schema, then import all 150+ parks. **Note: this schema is extended by the audit — see Revisions section above and SITE-AUDIT.md §7 for the augmented schema before importing.**

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | Single line text | ✅ | Display name |
| Slug | Single line text | ✅ | URL slug, e.g. `allentown-skate-plaza`. Unique. |
| City | Single line text | ✅ | |
| County | Single line text | ✅ | |
| Address | Single line text | ✅ | Full street address |
| Lat | Number | ✅ | Decimal degrees |
| Lng | Number | ✅ | Decimal degrees |
| Material | Single select | ✅ | Allowed: `Concrete`, `Asphalt`, `Wood`, `Mixed` |
| Style | Single select | — | Allowed: `Street plaza`, `Bowl`, `Street + bowl`, `Pump track`, `Mixed` |
| Lighting | Checkbox | — | True if lit at night |
| Helmets | Single select | — | Allowed: `Required under 12`, `Required all ages`, `Recommended`, `None posted` |
| Beginner | Checkbox | — | True if suitable for beginners |
| Description | Long text | — | Plain English, no jargon |
| Photos | Attachments | — | Up to 3 images. Fallback to placeholder if empty. |
| Coaching | Checkbox | — | True = render coaching sidebar. Default: false. |
3. **Geocode any missing parks** — run any parks without lat/lng through Nominatim or Google Geocoding API.
4. **Scaffold Next.js app** — App Router, Tailwind, Leaflet client component, Airtable API integration. Deploy empty shell to Vercel.
5. **Build map page** — full-screen Leaflet map, pins from Airtable data, click opens park sidebar list entry.
6. **Build park profile pages** — static generation from Airtable, gallery component, directions block, features grid, nearby parks, coaching sidebar (conditional).
7. **Mobile polish + SEO** — page titles, meta descriptions, Open Graph tags per park, sitemap.xml.

## What I noticed about how you think

- You corrected the "awareness vs. search" premise immediately and precisely: *"all of these options are true"* — you didn't pick a side, you identified that the framing was a false choice. That kind of precision matters when you're writing product specs.
- When describing the audience, you went specific fast: *"parents who are looking for a way to help their kids who are interested in skateboarding."* That's a person, not a category. Most people stay at "families."
- You removed things. The "By County" nav item, the generic tags, the oversized sidebar — you knew what was redundant without being asked twice. Subtraction is harder than addition.
- The coaching angle wasn't in the original pitch. You added it mid-session, and you added it correctly — not as a nav item, not as a homepage takeover, but as a contextual sidebar on the right parks. You already understood where in the funnel it belongs.
