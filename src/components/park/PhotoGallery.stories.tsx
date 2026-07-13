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

// Build N photos off the one sample image so the collage layouts are visible
// without a live DB. Captions/alt vary a little for realism.
function makePhotos(n: number): LightboxPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    storagePath: SAMPLE_PHOTO_PATH,
    caption: i === 0 ? "The main bowl" : null,
    credit: null,
    altText: `Photo ${i + 1}`,
  }));
}

// Click any tile to open the lightbox — arrow keys navigate, Esc closes.
// Each story exercises a different collage shape (graceful degradation by count).
export const OnePhoto: Story = {
  args: { parkName: "FDR Skatepark", photos: makePhotos(1) },
};

export const TwoPhotos: Story = {
  args: { parkName: "FDR Skatepark", photos: makePhotos(2) },
};

export const ThreePhotos: Story = {
  args: { parkName: "FDR Skatepark", photos: makePhotos(3) },
};

export const FourPhotos: Story = {
  args: { parkName: "FDR Skatepark", photos: makePhotos(4) },
};

// The real-world case — hero + 4 tiles, "+23 more" on the last tile.
export const ManyPhotos: Story = {
  args: { parkName: "FDR Skatepark", photos: makePhotos(28) },
};

// Hides silently — no photos.
export const Empty: Story = {
  args: { parkName: "FDR Skatepark", photos: [] },
};
