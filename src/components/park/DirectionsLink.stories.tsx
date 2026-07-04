import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DirectionsLink } from "./DirectionsLink";

const meta = {
  title: "Park/DirectionsLink",
  component: DirectionsLink,
} satisfies Meta<typeof DirectionsLink>;

export default meta;
type Story = StoryObj<typeof meta>;

// Renders live — inspect the href in your browser's dev tools. It'll read
// Google Maps on any normal desktop/Android browser, and switch to Apple
// Maps automatically only if you actually load this Storybook in iPhone
// Safari (real UA check, not a Storybook toggle — see DirectionsLink.tsx
// and DirectionsLink.test.tsx for the two branches).
export const Default: Story = {
  args: {
    parkName: "FDR Skatepark",
    lat: 39.9,
    lng: -75.19,
    fullAddress: "1500 Pattison Ave, Philadelphia, PA 19145",
  },
};
