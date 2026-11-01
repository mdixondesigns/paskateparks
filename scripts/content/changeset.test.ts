import { describe, expect, it } from "vitest";

import { referencedPhotoPaths, validateChangeset } from "./changeset";

const newPark = {
  issue: 12,
  summary: "Add Allentown Skatepark",
  parks: [
    {
      slug: "allentown",
      fields: {
        name: "Allentown Skatepark",
        city: "Allentown",
        county: "Lehigh",
        status: "open",
        park_type: "concrete_park",
        lat: 40.6,
        lng: -75.47,
        fee: false,
        reopen_expected_at: null,
      },
      obstacles: ["quarter_pipe", "hubba"],
      riding_surfaces: ["concrete"],
      amenities: [{ type: "lights", present: true, notes: "Until 10pm" }],
      links: [
        { type: "instagram", url: "https://instagram.com/allentownsk8", label: "@allentownsk8" },
      ],
      photos_add: [
        { path: "parks/allentown/i12-01", alt_text: "Concrete bowl with a pool coping edge" },
      ],
    },
  ],
};

function errorsFor(input: unknown): string[] {
  const r = validateChangeset(input);
  return r.ok ? [] : r.errors;
}

function withPark(overrides: Record<string, unknown>) {
  return { ...newPark, parks: [{ ...newPark.parks[0], ...overrides }] };
}

describe("validateChangeset", () => {
  it("accepts a complete new-park changeset", () => {
    expect(errorsFor(newPark)).toEqual([]);
  });

  it("accepts a minimal update to one field", () => {
    expect(
      errorsFor({ summary: "FDR hours", parks: [{ slug: "fdr", fields: { hours: "Dawn–dusk" } }] }),
    ).toEqual([]);
  });

  it("requires a summary and at least one park", () => {
    expect(errorsFor({ parks: [] })).toEqual([
      "summary is required",
      "parks must be a non-empty array",
    ]);
  });

  it("rejects unknown keys at every level", () => {
    const errs = errorsFor({ ...withPark({ photos: [] }), extra: 1 });
    expect(errs).toContain('unknown top-level key "extra"');
    expect(errs).toContain('parks[0]: unknown key "photos"');
  });

  it("rejects non-editable and unknown park fields", () => {
    const errs = errorsFor(withPark({ fields: { id: 5, wp_post_id: 1, colour: "red" } }));
    expect(errs).toEqual([
      'parks["allentown"].fields: "id" is not an editable park field',
      'parks["allentown"].fields: "wp_post_id" is not an editable park field',
      'parks["allentown"].fields: "colour" is not an editable park field',
    ]);
  });

  it("type-checks fields, including enums, dates, and NOT NULL columns", () => {
    const errs = errorsFor(
      withPark({
        fields: {
          name: null,
          status: "closed",
          established_year: 2001.5,
          fee: "no",
          reopen_expected_at: "next spring",
        },
      }),
    );
    expect(errs).toHaveLength(5);
    expect(errs[0]).toBe('parks["allentown"].fields.name cannot be null');
    expect(errs[1]).toMatch(/status must be one of: open, temporarily_closed/);
    expect(errs[2]).toMatch(/established_year must be an integer/);
    expect(errs[3]).toMatch(/fee must be true or false/);
    expect(errs[4]).toMatch(/reopen_expected_at must be a YYYY-MM-DD date/);
  });

  it("rejects counties the site doesn't know about", () => {
    const errs = errorsFor(withPark({ fields: { county: "Lehigh County" } }));
    expect(errs[0]).toMatch(/county "Lehigh County" is not in src\/lib\/counties.ts/);
  });

  it("catches coordinates outside Pennsylvania (e.g. swapped lat/lng)", () => {
    const errs = errorsFor(withPark({ fields: { lat: -75.47, lng: 40.6 } }));
    expect(errs).toEqual([
      'parks["allentown"].fields.lat -75.47 is outside Pennsylvania (lat/lng swapped?)',
      'parks["allentown"].fields.lng 40.6 is outside Pennsylvania (should be negative)',
    ]);
  });

  it("validates list values and rejects duplicates", () => {
    const errs = errorsFor(
      withPark({ obstacles: ["hubba", "hubba", "skyscraper"], riding_surfaces: ["dirt"] }),
    );
    expect(errs).toHaveLength(3);
    expect(errs[0]).toMatch(/"hubba" is listed twice/);
    expect(errs[1]).toMatch(/"skyscraper" is not one of/);
    expect(errs[2]).toMatch(/riding_surfaces: "dirt" is not one of/);
  });

  it("validates links", () => {
    const errs = errorsFor(withPark({ links: [{ type: "myspace", url: "instagram.com/x" }] }));
    expect(errs).toHaveLength(2);
    expect(errs[0]).toMatch(/links\[0\].type must be one of/);
    expect(errs[1]).toMatch(/links\[0\].url must be an http\(s\) URL/);
  });

  it("requires photo paths under the park's own folder, without size suffix", () => {
    const errs = errorsFor(
      withPark({
        photos_add: [
          { path: "parks/fdr/i12-01", alt_text: "A long enough description" },
          { path: "parks/allentown/i12-02@800w.jpg", alt_text: "A long enough description" },
        ],
        fields: { hero_photo_path: "photos/hero" },
      }),
    );
    expect(errs).toHaveLength(3);
    expect(errs.join("\n")).toMatch(/must be under parks\/allentown\//);
    expect(errs.join("\n")).toMatch(/i12-02@800w\.jpg" must look like parks\/<slug>\/<name>/);
    expect(errs.join("\n")).toMatch(/hero_photo_path "photos\/hero" must look like/);
  });

  it("requires meaningful alt text on every photo", () => {
    const errs = errorsFor(
      withPark({ photos_add: [{ path: "parks/allentown/i12-01", alt_text: "photo" }] }),
    );
    expect(errs[0]).toMatch(/alt_text is required/);
  });

  it("rejects the same park twice and bad slugs", () => {
    const errs = errorsFor({
      summary: "x",
      parks: [{ slug: "fdr" }, { slug: "fdr" }, { slug: "Bad Slug" }],
    });
    expect(errs).toContain('park "fdr" appears twice — merge the entries');
    expect(errs.some((e) => e.startsWith("parks[2].slug"))).toBe(true);
  });
});

describe("referencedPhotoPaths", () => {
  it("collects gallery, hero, and riding-surface photo paths once each", () => {
    const r = validateChangeset(
      withPark({
        fields: {
          name: "Allentown Skatepark",
          city: "Allentown",
          hero_photo_path: "parks/allentown/i12-01",
          riding_surface_photo_path: "parks/allentown/i12-02",
        },
      }),
    );
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(referencedPhotoPaths(r.changeset).sort()).toEqual([
      "parks/allentown/i12-01",
      "parks/allentown/i12-02",
    ]);
  });
});
