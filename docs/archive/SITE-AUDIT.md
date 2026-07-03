# paskateparks.com — Site Audit

> **Archived 2026-07-03.** The WordPress → Next.js/Supabase migration this audit informed is complete and live. Kept as historical reference for the old URL structure, data model, and content inventory — not actionable anymore.

**Audited:** 2026-05-30
**Method:** Headless browser crawl of homepage, /parks/, /all-parks/, /map/, sitemap.xml, sample park profiles, sample builder and shop pages.
**Purpose:** Document current URL structure, data model, and content inventory before the Next.js + Airtable rebuild — so nothing of value is lost.

---

## TL;DR

- **WordPress site** (Twenty Twenty-One parent + `PASkateparks` child theme). WP Google Maps, Search Filter Pro, Lightbox Photoswipe.
- **URL pattern: `/park/<slug>/`** (singular). Custom post type. **Must be preserved verbatim** — these URLs have years of SEO equity.
- **47 park profile pages live.** 99 additional park names appear on `/all-parks/` as stub entries (city only, no profile). The "150+ parks" number is real as inventory; only ~32% are fully built out.
- **Three custom post types**, not just parks: `park`, `builder`, `shop`. The design doc only contemplated parks. Builders and shops are first-class entities with their own URLs.
- **Data model is far richer than the design doc planned for.** ~20 fields per park profile vs. the 14 fields in the design doc's proposed Airtable schema. Most notable gaps: square footage, year established, hours (free text), riding surface variants, bathroom type, parking type, builder relationship, nearby shops relationship.
- **38 distinct obstacle taxonomy terms** (Quarter Pipe, Hubba, Bank/Wedge, Flat Rail, etc.) with per-park tagging. The design doc captured this as `Style: Street/Bowl/Pump track` — that's a coarse downsampling of real skater data.
- **County coverage gap:** Only 14 PA counties have parks indexed (out of 67). Not a rebuild issue, but worth knowing.
- **Migration risk = HIGH if URLs change.** Migration risk = LOW if URLs are preserved and schema is widened.

---

## 1. Tech Stack (observed)

| Layer | What it is |
|---|---|
| CMS | WordPress (self-hosted) |
| Theme | `twentytwentyone` parent + `PASkateparks` child theme (`/wp-content/themes/PASkateparks/`) |
| Hosting hints | Cloudflare in front (header `server: cloudflare`) |
| Map | WP Google Maps plugin (`wpgmza_*`) — Google Maps API, not Leaflet |
| Search/filter | Search Filter Pro (`/wp-content/plugins/search-filter-pro/`) |
| Photo lightbox | Lightbox Photoswipe (`/wp-content/plugins/lightbox-photoswipe/`) |
| Carousel | Gutenslider (`/wp-content/plugins/gutenslider/`) |
| Analytics | Site Kit by Google (Google Analytics) |
| Sitemap | Native WP core sitemap at `/wp-sitemap.xml` |
| Forms | `/new-park/` submission form (looks like a generic block-editor form — JS-required) |
| Shop | External — links to `paskateparks.bigcartel.com` |

---

## 2. URL Structure (canonical inventory)

### Singular post URLs
| Pattern | Type | Count | Examples |
|---|---|---|---|
| `/park/<slug>/` | Custom post: park | **47** (in sitemap) | `/park/bayne-skatepark/`, `/park/9th-and-poplar/`, `/park/fdr/` |
| `/builder/<slug>/` | Custom post: builder | **14** | `/builder/spohn-ranch-skateparks/`, `/builder/grindline-skateparks/`, `/builder/diy/` |
| `/shop/<slug>/` | Custom post: shop | **20** | `/shop/nocturnal/`, `/shop/zembo-temple-of-skate-design/` |

### Taxonomy archive URLs
| Pattern | Taxonomy | Count |
|---|---|---|
| `/regions_and_counties/<slug>/` | County / region | 14 (Bucks, Philadelphia, Delaware, Montgomery, Chester, York, Lancaster, Berks, Lehigh, Northampton, Perry, Blair, Allegheny, Butler) |
| `/park_obstacles/<slug>/` | Obstacle | 38 |
| _(none observed)_ | `riding_surface` taxonomy registered in sitemap but no public archive crawled |

### Top-level pages
| URL | Purpose |
|---|---|
| `/` | Homepage |
| `/parks/` | Search + filter interface (Search Filter Pro) — the primary discovery UI |
| `/all-parks/` | Flat alphabetical list of every park (146 items, 47 linked, 99 text-only stubs) |
| `/map/` | Standalone WP Google Maps page |
| `/blog/` | Blog index (content not audited) |
| `/events/` | Events page |
| `/new-park/` | Submission form: park name + suggester contact info |
| `/style-guide/` | Internal style guide (worth checking — may show design system the owner already uses) |
| `/privacy-policy/` | Standard |

### `/all-parks/` link state
- 146 total `<li>` entries
- **47 linked** → individual `/park/<slug>/` profile
- **99 unlinked** → just text like `Ambler Skatepark, Ambler PA` — represents known parks awaiting profile work

### URL slugs — sample
```
/park/9th-and-poplar/
/park/bayne-skatepark/
/park/bensalem-township-community-park/
/park/bethlehem-skateplaza/
/park/carl-w-saldutti-jr-skatepark/
/park/downingtown-skatepark/
/park/fdr/
/park/granahan/
/park/grays-ferry-crescent-skatepark/
/park/haverford-township-skatepark/
```
Full list of 47 was saved to `park-urls.txt`, deleted 2026-07-03 (superseded by the live routes and `src/lib/retired-urls.ts`).

### robots.txt
```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Crawl-delay: 10
Sitemap: https://paskateparks.com/wp-sitemap.xml
```

---

## 3. Park Profile Data Model (what's actually on a page)

Observed by sampling two parks: `/park/bayne-skatepark/` and `/park/9th-and-poplar/`. The template is consistent.

### Hero block
- Position counter: `1/12`, `1/14` — appears to be position within a paginated/filtered set
- **Park name**
- **Square footage** (e.g., `6,640sqft`, `23,600sqft`)
- **Park type** (Skate Plaza, DIY Park, Concrete Park, Indoor Park, Prefab Park)
- **County / city** (free text in subhead)
- **Year established** (e.g., `Est. 2012`)
- Photo gallery (1–15+ images per park — Bayne has 8, 9th and Poplar has 15)

### Hours and Rules block (free text)
- Hours (e.g., `9:00am to dusk, daily`, `7am - 10:30pm, daily`)
- Fee (Yes / No / free-text)
- Pads (None / Required / Recommended)
- Equipment rentals (Yes / No)

### Address block
- Full street address
- "Directions" link (likely opens Google Maps)

### Connect block
- Instagram handle (e.g., `@bellevueskateplaza`)
- Operator/manager (e.g., `Bellevue Borough`)

### Support the park block
- Fundraiser link (GoFundMe, custom, etc.) — conditional, not all parks have

### Overview block
- Plain-English description (paragraph)

### Obstacles list
- Tag set from the 38-term `park_obstacles` taxonomy
- Example (Bayne): Bank/Wedge, Flat Rail, Gap, Grind Box/Ledge, Handrail, Hubba, Kicker/Launch Ramp, Manual Pad, Pole, Pyramid, Quarter Pipe, Stair

### Amenities block
- Riding Surface(s): Concrete, Asphalt, Wood (multi-select)
- Bathroom: None / Porta / Permanent
- Drinking Water: Yes / No
- Lights: Yes / No
- Spectator Area(s): Bench, Standing Room (multi-select)
- Onsite Shop: Yes / No
- Parking: Lot / Street / etc.

### Builders block
- Relationship to one or more `/builder/<slug>/` posts (e.g., Spohn Ranch Skateparks)

### Nearby Shops block
- Calculated list of `/shop/<slug>/` records with distance (`0.1 miles away`, `5.7 miles away`)
- Shows 2–3 shops sorted by proximity

### Photo gallery details
- Hosted at `/wp-content/uploads/YYYY/MM/<ParkName>_NN.jpg`
- Multiple WP-generated sizes per image (full, 1024×, 300×, 225×)
- Each image is a Photoswipe lightbox trigger
- File naming is consistent: `ParkName_01.jpg`, `ParkName_02.jpg`, etc.

---

## 4. Filter / Search UI (`/parks/`)

Search Filter Pro powers a faceted search:

| Filter | Type | Options |
|---|---|---|
| Text search | Free input | — |
| Park Type | Single select | Concrete Park (20), DIY Park (6), Indoor Park (8), Prefab Park (10), Skate Plaza (4) |
| Status | Single select | Open (45), Permanently Closed (2), Temporarily Closed (1) |
| Obstacles | Multi-checkbox | 38 options (see below) |

### Status taxonomy — NEW finding
The design doc did not contemplate park status. **2 parks are permanently closed, 1 temporarily closed** in the live data. The rebuild needs a status field or these will render as "open" with no warning. Showing a parent the location of a permanently closed park is a bad first impression.

### Obstacle taxonomy — full list with park counts
```
Grind Box / Ledge (44)   Quarter Pipe (44)        Flat Rail (38)
Bank / Wedge (37)        Hubba (31)               Manual Pad (30)
Funbox (29)              Hip (26)                 Handrail (22)
Curb (21)                Pyramid (20)             Kicker / Launch Ramp (19)
Stair (18)               Wallride (17)            Mini Ramp (14)
Spine (14)               Euro / London Gap (12)   Pool / Bowl (12)
Extension (11)           Gap (11)                 Roll In (11)
Volcano (9)              Jersey Barrier (8)       A-Frame (7)
Amoeba Pool (7)          Box Jump (7)             Picnic Table (7)
Pole (6)                 Rainbow Rail (5)         Escalator (4)
Full Pipe (4)            Cradle / Over Vert (3)   Snake Run (3)
Fire Hydrant (2)         Whoop Dee Doo (2)        Foam Pit (1)
Mega Ramp (1)            Pump track (1)
```

The design doc had `Style: Street plaza | Bowl | Street + bowl | Pump track | Mixed` (5 values).
The live site has **38 obstacle terms** that compose into "style." This is more accurate to how skaters actually search.

### Park Type — five categories (design doc had four)
Live site: **Concrete Park, DIY Park, Indoor Park, Prefab Park, Skate Plaza**
Design doc Material: `Concrete, Asphalt, Wood, Mixed`

These are not the same axis. The live site mixes construction style (Concrete, DIY, Prefab) with venue type (Indoor, Skate Plaza). Riding Surface is a separate field on the profile (Concrete, Asphalt, etc.). The Airtable schema needs both.

---

## 5. The Three Custom Post Types

### `park` (47 published, 99 listed as stubs)
The main entity. Rich profile template as documented above.

### `builder` (14)
Skatepark construction companies / individuals. Each has its own URL. Currently the pages are stubs (just the name + prev/next nav). Relationship: many parks point to one or more builders.

Examples: Spohn Ranch Skateparks, Grindline Skateparks, Site Design Group Inc, 5th Pocket Skateparks, DIY (used for community-built), Tom Martyn, Pat Bodor.

### `shop` (20)
Skate shops in PA. Each has its own URL. Used to compute "Nearby Shops" on park profiles.

Examples: Nocturnal (Philly), Zembo Temple of Skate & Design, Plank Eye Board Shop (Pittsburgh), Radio Skateshop, Exist Skate Shop.

**The design doc did not contemplate either `builder` or `shop` as entities.** Decisions needed:
1. **Migrate as-is?** Keep `/builder/<slug>/` and `/shop/<slug>/` URLs alive (with redirects to new pages). This protects SEO equity from existing inbound links.
2. **Flesh them out?** Currently the pages are stubs. A real builder profile (parks built, photos, contact) or shop profile (address, hours, brands carried, link) could be valuable.
3. **Quietly retire?** If the only purpose is the "Nearby Shops" relationship on park profiles, the shops can live in Airtable as a simple table without public URLs. Same for builders.

---

## 6. SEO Risks for the Rebuild

| Risk | Severity | Mitigation |
|---|---|---|
| Changing `/park/<slug>/` URL structure | **Critical** | Preserve exactly. The slugs are already SEO-friendly. |
| Dropping `/builder/<slug>/` and `/shop/<slug>/` URLs | High | 301 redirect to consolidated pages, or keep as routes in Next.js. |
| Dropping taxonomy archive pages (`/regions_and_counties/<county>/`, `/park_obstacles/<obstacle>/`) | Medium | These rank for long-tail searches like "[county] skateparks" — preserve as Next.js routes. |
| Losing the 99 stub park names from `/all-parks/` | Low–Medium | Decide: are stubs SEO assets (name appears in Google), or just future work tracking? If the latter, move them out of the public site into Airtable as `draft` status. |
| Plain-text park descriptions migrated through HTML stripping | Medium | Some descriptions may contain inline links, line breaks, or italics. Preserve markdown/HTML when importing to Airtable. |
| Image URLs changing | High | Either: keep WordPress as the image host until migration is fully cut over, or rewrite all `<img src>` references during the import. |
| Loss of `/blog/` and `/events/` content | Unknown | Not audited — needs separate scope decision. |

---

## 7. Updated Airtable Schema (what the design doc had vs. what reality demands)

### Fields the design doc had (14)
Name, Slug, City, County, Address, Lat, Lng, Material, Style, Lighting, Helmets, Beginner, Description, Photos, Coaching

### Fields to add based on the live data (8 new, several renames)
| Field | Type | Required | Source |
|---|---|---|---|
| `SquareFootage` | Number | — | Hero block — every park has this |
| `YearEstablished` | Number | — | Hero block — `Est. YYYY` |
| `Status` | Single select | ✅ | `Open`, `Temporarily Closed`, `Permanently Closed` — live site already uses this |
| `Hours` | Long text | — | Free text — varies widely (`9:00am to dusk, daily`, `7am - 10:30pm, daily`) |
| `Fee` | Single select | — | `Free`, `Paid`, plus a `FeeNotes` long-text field |
| `EquipmentRentals` | Checkbox | — | Yes/No |
| `Bathroom` | Single select | — | `None`, `Porta`, `Permanent` |
| `DrinkingWater` | Checkbox | — | Yes/No |
| `SpectatorArea` | Multi-select | — | `Bench`, `Standing Room`, etc. |
| `OnsiteShop` | Checkbox | — | Yes/No |
| `Parking` | Single select | — | `Lot`, `Street`, `None`, `Mixed` |
| `InstagramHandle` | Single line text | — | e.g. `@bellevueskateplaza` |
| `Operator` | Single line text | — | e.g. `Bellevue Borough` |
| `FundraiserUrl` | URL | — | Conditional |
| `Builders` | Multi-select OR linked records | — | Tied to a Builders table |
| `Obstacles` | Multi-select | — | **38 options** from the live taxonomy — not 5 |
| `ParkType` | Single select | ✅ | `Concrete Park`, `DIY Park`, `Indoor Park`, `Prefab Park`, `Skate Plaza` (replaces `Material` as primary type) |
| `RidingSurface` | Multi-select | ✅ | `Concrete`, `Asphalt`, `Wood`, `Mixed` (moves the design doc's `Material` here) |
| `WordPressPostId` | Number | — | Preserve original WP post ID for migration tracking |

### Renames
- `Material` → `RidingSurface` (clearer; matches the live site's label)
- New `ParkType` field carries the type/venue concept (was missing)

### Tables to add
- **Builders** (14 records) — name, slug, website, contact, list of parks built
- **Shops** (20 records) — name, slug, address, lat/lng, website, brands, hours
- **Nearby Shops** can be **computed at build time** (Haversine on shop lat/lng vs. park lat/lng) — no need to store the relationship.

---

## 8. Recommendations for the Rebuild

1. **Lock the URL structure.** `/park/<slug>/`, `/builder/<slug>/`, `/shop/<slug>/`, `/regions_and_counties/<slug>/` (or `/county/<slug>/` if cleaner), `/park_obstacles/<slug>/` (or `/obstacle/<slug>/`). Add 301s in `next.config.js` for any slug changes — but the existing slugs are good, don't change them.
2. **Widen the Airtable schema** per Section 7 before importing. Importing into the design doc's original 14-field schema would lose ~50% of the field-level data.
3. **All 150+ parks get profile pages.** Per owner clarification (2026-05-30): the 99 currently un-paged parks represent unfinished content authoring on the live site, not a tiered content strategy. The rebuild template must render park profiles gracefully when data is partial (no description → omit overview; no photos → omit gallery; no obstacles → omit tag list). No `Status: Stub` field needed. Filling in the missing 99 parks is content work that runs in parallel with the rebuild — the rebuild itself does not gate on it.
4. **Migrate Builders and Shops as real entities.** Don't drop them — even as stubs they have inbound SEO value. Build out the templates progressively.
5. **Preserve image URLs OR rewrite atomically.** Don't half-migrate. Either point Next.js at `paskateparks.com/wp-content/uploads/...` until the new image host is fully populated, or do a one-shot import-and-rewrite.
6. **Add a `Status` filter to the new `/parks/` search.** The live site has it. Showing closed parks without a clear flag breaks trust.
7. **Verify the `/style-guide/` page** before designing the new look. The owner may already have an established palette/type system worth preserving.

---

## 9. Open Questions to Take to the Owner

1. ✅ **Position counter (`1/12`, `1/14`)** — RESOLVED 2026-05-30. NOT an editorial ranking. It's the photo gallery image counter (HTML class `image-gallery-count`). "1/12" means "viewing image 1 of 12 in this park's gallery." Rendered dynamically from photo array length. No data migration needed.
2. **Where do the lat/lng coordinates live?** WP Google Maps stores them — extract from the WP database via export, not from the rendered HTML.
3. ✅ **Photo permissions / credits** — RESOLVED 2026-05-30. Sampled 20 photos via WP REST API: 0/20 have alt text, 0/20 have captions, 0/20 contain "photo by" or "credit" language. The live WP site has zero per-photo metadata. Nothing to migrate. Forward strategy (per DESIGN.md D29): the rebuild introduces a Photos child table with optional `Credit` + `Caption` fields per photo to support contributor credits going forward. Accessibility: alt text auto-generates from park name + photo index when `Credit`/`Caption` are absent.
4. **County coverage — 14 of 67 counties.** Even with all 150+ parks fully built out, only 14 PA counties are represented in the current data. Is that real (the other 53 counties have no public skateparks) or is there more inventory not yet discovered? Affects the "statewide" marketing claim.
5. ✅ **Blog and Events content** — RESOLVED 2026-05-30. OUT OF SCOPE for this rebuild. Not audited, not migrated. Existing /blog/ and /events/ URLs are not part of the new site. Decision can be revisited in a future iteration.
6. **`/new-park/` form destination.** Where do submissions go? Email? CRM? Airtable? Preserve the flow.
7. ✅ **`/style-guide/` page** — RESOLVED 2026-05-30. Page is old placeholder content AND per owner clarification the live site's design system is NOT canonical for the rebuild. Nothing to extract. The new design direction will be defined in a separate session (likely via `/design-consultation`).

---

## Artifacts

- Screenshots and the full park URL list captured during this audit were deleted 2026-07-03 (migration complete, no longer referenced anywhere).
- WP sitemap index: https://paskateparks.com/wp-sitemap.xml
