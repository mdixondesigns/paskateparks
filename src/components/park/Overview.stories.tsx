import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Overview } from "./Overview";
import { buildPark, richPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/Overview",
  component: Overview,
} satisfies Meta<typeof Overview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DescriptionAndPhotos: Story = {
  args: { park: richPark },
};

export const DescriptionOnly: Story = {
  args: { park: buildPark({ photos: [] }) },
};

export const PhotosOnly: Story = {
  args: { park: buildPark({ description: null, photos: richPark.photos }) },
};

// Hides silently — no description, no photos.
export const Empty: Story = {
  args: { park: buildPark({ description: null, photos: [] }) },
};
