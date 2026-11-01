# Content changesets

Park content (the database) changes through files here, so every change is
reviewed in a PR like code. One file per change, named `NNNN-<slug>.json` where
`NNNN` is the GitHub issue number, zero-padded (`0012-allentown.json`).

Lifecycle: **staging** (`pnpm content:apply <file>`, shown in the Vercel
preview) → PR merged → **production** (the "Apply content to production"
workflow, after the owner approves it).

## Commands

| Command | What it does |
|---|---|
| `pnpm content:photo <slug> <issue> <image…>` | Auto-rotate, resize to 400/800/1200px JPEGs, upload to **staging**. Prints the storage paths for `photos_add`. |
| `pnpm content:check [file…]` | Validate (no database). CI runs this on every PR. |
| `pnpm content:apply <file…>` | Apply to **staging**. Safe to re-run. |
| `pnpm content:apply --production --dry-run` | List changesets production hasn't had yet (read-only). |

## Format

```json
{
  "issue": 12,
  "summary": "Add Allentown Skatepark",
  "parks": [
    {
      "slug": "allentown",
      "fields": {
        "name": "Allentown Skatepark",
        "city": "Allentown",
        "county": "Lehigh",
        "status": "open",
        "park_type": "concrete_park",
        "lat": 40.6084,
        "lng": -75.4902,
        "street_address": "123 Example St",
        "zip": "18101",
        "hours": "Dawn to dusk",
        "description": "…",
        "hero_photo_path": "parks/allentown/i12-01"
      },
      "obstacles": ["quarter_pipe", "hubba", "pool_bowl"],
      "riding_surfaces": ["concrete"],
      "amenities": [{ "type": "lights", "present": true, "notes": "Until 10pm" }],
      "links": [{ "type": "instagram", "url": "https://instagram.com/…", "label": "@…" }],
      "photos_add": [
        { "path": "parks/allentown/i12-01", "alt_text": "…", "credit": "Jane Doe", "caption": null }
      ]
    }
  ]
}
```

Rules:

- **Parks are keyed by `slug`.** A new slug creates the park (needs at least
  `name` and `city`); an existing slug updates it. Only the `fields` you list
  change.
- **Lists replace.** `obstacles`, `riding_surfaces`, `amenities`, and `links`
  replace the park's entire list when present — to add one obstacle to an
  existing park, list all of its current obstacles plus the new one. Omit a
  list to leave it unchanged.
- **Photos append.** `photos_add` adds to the end of the gallery; a path that's
  already there just has its text updated. The first gallery photo is the
  park's map thumbnail; `hero_photo_path` overrides the hero band only.
- **Status changes** stamp `status_changed_at` automatically. Use
  `temporarily_closed` + `reopen_expected_at` (YYYY-MM-DD) or
  `permanently_closed` — parks are never deleted.
- **County** must be a display name from `src/lib/counties.ts` (e.g. `"Bucks"`).
  A park in a new county needs that file updated in the same PR.
- **Allowed values** for every enum (`status`, `park_type`, `helmets`,
  obstacles, surfaces, amenities, link types) are in `src/db/schema.ts`;
  `pnpm content:check` lists them on a mismatch.
- Not supported yet: deleting parks or photos, renovations, builders, shops.
