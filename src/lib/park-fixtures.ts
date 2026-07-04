import type { ParkWithRelations } from "@/lib/park-query";

// Shared fixture builder for Storybook stories. Mirrors the local `parkWith`
// pattern used in component tests (e.g. Overview.test.tsx) but centralized
// here since story files for many different components need the same
// ParkWithRelations shape — unlike tests, which usually only override 1-2
// fields and are fine duplicating the base object once per file.
export function buildPark(overrides: Partial<ParkWithRelations> = {}): ParkWithRelations {
  return {
    id: 1,
    slug: "fdr-skatepark",
    name: "FDR Skatepark",
    status: "open",
    city: "Philadelphia",
    state: "PA",
    alias: null,
    establishedYear: 1994,
    parkType: "diy_park",
    squareFootage: 33000,
    county: "Philadelphia",
    streetAddress: "1500 Pattison Ave",
    zip: "19145",
    lat: 39.9,
    lng: -75.19,
    hours: "Dawn to dusk, daily",
    description: "<p>The most-photographed DIY skatepark in Pennsylvania.</p>",
    allowsSkateboards: true,
    allowsBikes: true,
    allowsRollerSkates: true,
    allowsScooters: true,
    vehicleRulesNotes: null,
    helmets: "none_posted",
    otherPadsRequired: false,
    fee: false,
    programming: false,
    ridingSurfaceNotes: null,
    ridingSurfacePhotoPath: null,
    statusChangedAt: null,
    reopenExpectedAt: null,
    photos: [],
    amenities: [],
    surfaces: [],
    obstacles: [],
    builders: [],
    renovations: [],
    links: [],
    ...overrides,
  } as ParkWithRelations;
}

// A photo path that resolves against the real Supabase Storage bucket
// (NEXT_PUBLIC_SUPABASE_URL from .env.local) — swap for any real storage
// path from the `photos` bucket to preview against an actual photo.
export const SAMPLE_PHOTO_PATH = "parks/fdr-skatepark/photo-01";

// A fully "rich" park — every section has data, for previewing the complete
// 16-section profile at once.
export const richPark = buildPark({
  alias: "The Meadow",
  description:
    "<p>FDR is the mecca. Built entirely by skaters under a highway overpass, it keeps growing every year.</p><p>Bring a friend who's never skated before — the flow sections are forgiving.</p>",
  vehicleRulesNotes: "BMX riders please yield to skaters in the bowl.",
  helmets: "recommended",
  programming: true,
  ridingSurfaceNotes: "Mostly smooth troweled concrete; a few rougher DIY patches.",
  photos: [
    {
      id: 1,
      parkId: 1,
      storagePath: SAMPLE_PHOTO_PATH,
      credit: "Jane Skater",
      caption: "The main bowl at golden hour",
      altText: "Concrete bowl with skaters at sunset",
      sortOrder: 0,
    },
  ],
  amenities: [
    {
      parkId: 1,
      type: "bathroom",
      present: true,
      notes: "Portable toilets near the entrance",
      photoPath: null,
    },
    { parkId: 1, type: "drinking_water", present: false, notes: null, photoPath: null },
    { parkId: 1, type: "lights", present: true, notes: null, photoPath: null },
    {
      parkId: 1,
      type: "parking",
      present: true,
      notes: "Free lot, fills up on weekends",
      photoPath: null,
    },
    { parkId: 1, type: "spectator_area", present: true, notes: null, photoPath: null },
    { parkId: 1, type: "onsite_shop", present: false, notes: null, photoPath: null },
    { parkId: 1, type: "equipment_rentals", present: false, notes: null, photoPath: null },
  ],
  surfaces: ["concrete", "wood"],
  obstacles: ["quarter_pipe", "pool_bowl", "hip", "spine", "bank_wedge", "hubba"],
  builders: [
    { id: 1, name: "DIY", url: null, logoPath: null, wpPostId: null },
    {
      id: 2,
      name: "Franklin's Paine Skatepark Fund",
      url: "https://phillyskatepark.org",
      logoPath: null,
      wpPostId: null,
    },
  ],
  renovations: [
    { id: 1, parkId: 1, year: 2017, notes: "New bowl extension", sortOrder: 0 },
    { id: 2, parkId: 1, year: 2022, notes: null, sortOrder: 1 },
  ],
  links: [
    {
      id: 1,
      parkId: 1,
      type: "instagram",
      url: "https://instagram.com/fdrskatepark",
      label: "@fdrskatepark",
      sortOrder: 0,
    },
    {
      id: 2,
      parkId: 1,
      type: "website",
      url: "https://phillyskatepark.org",
      label: null,
      sortOrder: 1,
    },
    {
      id: 3,
      parkId: 1,
      type: "gofundme",
      url: "https://gofundme.com/fdr-repairs",
      label: null,
      sortOrder: 0,
    },
  ],
});

// A stub park — the 99-of-150 "unfinished content" case per DESIGN.md and
// VISUAL-DESIGN.md §11. Only the required fields are set.
export const stubPark = buildPark({
  name: "Ambler Skatepark",
  slug: "ambler-skatepark",
  city: "Ambler",
  county: "Montgomery",
  establishedYear: null,
  parkType: null,
  squareFootage: null,
  streetAddress: null,
  zip: null,
  lat: null,
  lng: null,
  description: null,
});

// A permanently closed park — per D11 the page stays live as a historical
// record with a prominent banner.
export const closedPark = buildPark({
  name: "Love Park",
  slug: "love-park-historical",
  status: "permanently_closed",
  establishedYear: 1989,
  description: "<p>Legendary street plaza, closed to skating since 2016.</p>",
});
