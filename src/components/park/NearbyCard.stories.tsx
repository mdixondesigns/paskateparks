import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NearbyCard } from "./NearbyCard";
import { SAMPLE_PHOTO_PATH } from "@/lib/park-fixtures";

const meta = {
  title: "Park/NearbyCard",
  component: NearbyCard,
} satisfies Meta<typeof NearbyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPhotoAndDistance: Story = {
  args: {
    item: {
      id: 2,
      name: "9th and Poplar",
      city: "Philadelphia",
      state: "PA",
      distanceMiles: 2.4,
      href: "/park/9th-and-poplar",
      thumbStoragePath: SAMPLE_PHOTO_PATH,
    },
  },
};

// Homepage no-geo state (D6/D1) — no distance to show yet.
export const NoDistance: Story = {
  args: {
    item: {
      name: "Bayne Skatepark",
      city: "Pittsburgh",
      state: "PA",
      href: "/park/bayne-skatepark",
      thumbStoragePath: SAMPLE_PHOTO_PATH,
    },
  },
};

// Stub park — no photo yet, placeholder block instead.
export const NoPhoto: Story = {
  args: {
    item: {
      name: "Ambler Skatepark",
      city: "Ambler",
      state: "PA",
      distanceMiles: 12.1,
      href: "/park/ambler-skatepark",
      thumbStoragePath: null,
    },
  },
};
