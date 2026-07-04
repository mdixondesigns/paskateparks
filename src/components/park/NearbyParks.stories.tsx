import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NearbyParks } from "./NearbyParks";
import { SAMPLE_PHOTO_PATH } from "@/lib/park-fixtures";
import type { NearbyCardItem } from "./NearbyCard";

// NearbyShops (section 16) is the same NearbyCard list under a different
// heading and a looser distance rule (D5/D7) — no separate story needed,
// this one covers the shared visual.
const meta = {
  title: "Park/NearbyParks",
  component: NearbyParks,
} satisfies Meta<typeof NearbyParks>;

export default meta;
type Story = StoryObj<typeof meta>;

const items: NearbyCardItem[] = [
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
  {
    id: 4,
    name: "Bayne Skatepark",
    city: "Pittsburgh",
    state: "PA",
    distanceMiles: 28.9,
    href: "/park/bayne-skatepark",
    thumbStoragePath: SAMPLE_PHOTO_PATH,
  },
];

export const ThreeNearby: Story = {
  args: { items },
};

export const OneNearby: Story = {
  args: { items: items.slice(0, 1) },
};

// Hides silently — none within 30mi.
export const Empty: Story = {
  args: { items: [] },
};
