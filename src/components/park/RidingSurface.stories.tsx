import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { RidingSurface } from "./RidingSurface";
import { buildPark, SAMPLE_PHOTO_PATH } from "@/lib/park-fixtures";

const meta = {
  title: "Park/RidingSurface",
  component: RidingSurface,
} satisfies Meta<typeof RidingSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SurfacesOnly: Story = {
  args: { park: buildPark({ surfaces: ["concrete", "wood"] }) },
};

export const WithNotesAndPhoto: Story = {
  args: {
    park: buildPark({
      surfaces: ["concrete", "asphalt", "other"],
      ridingSurfaceNotes: "Concrete bowl, asphalt street section, one wood quarter pipe.",
      ridingSurfacePhotoPath: SAMPLE_PHOTO_PATH,
    }),
  },
};

// Hides silently — no surfaces, no notes, no photo.
export const Empty: Story = {
  args: { park: buildPark() },
};
