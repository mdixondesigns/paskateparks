import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AmenitiesGrid } from "./AmenitiesGrid";
import { richPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/AmenitiesGrid",
  component: AmenitiesGrid,
} satisfies Meta<typeof AmenitiesGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mix of present/absent, with and without notes/photo — the full range of
// per-row states described in TEST-PLAN.md.
export const Mixed: Story = {
  args: { amenities: richPark.amenities },
};

export const AllPresent: Story = {
  args: {
    amenities: richPark.amenities.map((a) => ({
      ...a,
      present: true,
      notes: null,
      photoPath: null,
    })),
  },
};

export const AllAbsent: Story = {
  args: {
    amenities: richPark.amenities.map((a) => ({
      ...a,
      present: false,
      notes: null,
      photoPath: null,
    })),
  },
};

// Renders null — hides silently when there are no amenity rows at all.
export const Empty: Story = {
  args: { amenities: [] },
};
