import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ParkProfile } from "./ParkProfile";
import { closedPark, richPark, SAMPLE_PHOTO_PATH, stubPark } from "@/lib/park-fixtures";
import type { NearbyCardItem } from "./NearbyCard";

const meta = {
  title: "Park/ParkProfile",
  component: ParkProfile,
  parameters: {
    // Full-width canvas reads better than Storybook's default padded layout
    // for a whole-page composition.
    layout: "fullscreen",
  },
} satisfies Meta<typeof ParkProfile>;

export default meta;
type Story = StoryObj<typeof meta>;

const nearbyParks: NearbyCardItem[] = [
  {
    id: 2,
    name: "9th and Poplar",
    city: "Philadelphia",
    state: "PA",
    distanceMiles: 2.4,
    href: "/park/9th-and-poplar",
    thumbStoragePath: SAMPLE_PHOTO_PATH,
  },
  {
    id: 3,
    name: "Paine's Park",
    city: "Philadelphia",
    state: "PA",
    distanceMiles: 3.1,
    href: "/park/paines-park",
    thumbStoragePath: null,
  },
];

const nearbyShops: NearbyCardItem[] = [
  {
    name: "Nocturnal",
    city: "Philadelphia",
    state: "PA",
    distanceMiles: 1.8,
    href: "https://nocturnalskate.com",
    thumbStoragePath: null,
  },
];

// All 16 sections populated — the composition to check overall rhythm,
// spacing, and section-to-section transitions against.
export const RichPark: Story = {
  args: { park: richPark, nearbyParks, nearbyShops },
};

// The 99-of-150 stub case — most sections should hide silently, per
// DESIGN.md's "render gracefully when fields are missing" rule.
export const StubPark: Story = {
  args: { park: stubPark, nearbyParks: [], nearbyShops: [] },
};

// D11 — status banner + Suggest an Edit button hidden (no point suggesting
// edits to a historical record).
export const PermanentlyClosedPark: Story = {
  args: { park: closedPark, nearbyParks, nearbyShops },
};
