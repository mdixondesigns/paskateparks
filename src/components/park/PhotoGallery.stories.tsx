import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PhotoGallery } from "./PhotoGallery";
import { SAMPLE_PHOTO_PATH } from "@/lib/park-fixtures";
import type { LightboxPhoto } from "./Lightbox";

const meta = {
  title: "Park/PhotoGallery",
  component: PhotoGallery,
} satisfies Meta<typeof PhotoGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

const photos: LightboxPhoto[] = [
  {
    id: 1,
    storagePath: SAMPLE_PHOTO_PATH,
    caption: "The main bowl",
    credit: "Jane Skater",
    altText: null,
  },
  { id: 2, storagePath: SAMPLE_PHOTO_PATH, caption: null, credit: null, altText: "Street section" },
  { id: 3, storagePath: SAMPLE_PHOTO_PATH, caption: "Sunset session", credit: null, altText: null },
];

// Click a thumbnail to open the lightbox — arrow keys navigate, Esc closes.
export const Strip: Story = {
  args: { parkName: "FDR Skatepark", photos },
};

export const SinglePhoto: Story = {
  args: { parkName: "FDR Skatepark", photos: photos.slice(0, 1) },
};

// Hides silently — no photos.
export const Empty: Story = {
  args: { parkName: "FDR Skatepark", photos: [] },
};
