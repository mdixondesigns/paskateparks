import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { HeroBlock } from "./HeroBlock";
import { buildPark, richPark, SAMPLE_PHOTO_PATH, stubPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/HeroBlock",
  component: HeroBlock,
} satisfies Meta<typeof HeroBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPhoto: Story = {
  args: { park: richPark },
};

export const NoPhoto: Story = {
  args: { park: buildPark() },
};

export const WithAliasAndRenovations: Story = {
  args: {
    park: buildPark({
      alias: "The Meadow",
      photos: [
        {
          id: 1,
          parkId: 1,
          storagePath: SAMPLE_PHOTO_PATH,
          credit: null,
          caption: null,
          altText: null,
          sortOrder: 0,
        },
      ],
      renovations: [
        { id: 1, parkId: 1, year: 2017, notes: null, sortOrder: 0 },
        { id: 2, parkId: 1, year: 2022, notes: null, sortOrder: 1 },
      ],
    }),
  },
};

// The 111-of-159 stub case per DESIGN.md — no photo, no established year.
export const Stub: Story = {
  args: { park: stubPark },
};
