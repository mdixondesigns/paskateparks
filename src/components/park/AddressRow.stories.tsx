import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AddressRow } from "./AddressRow";
import { buildPark, stubPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/AddressRow",
  component: AddressRow,
} satisfies Meta<typeof AddressRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// DirectionsLink defaults to Google Maps here (no iPhone UA in Storybook's
// browser) — see DirectionsLink.stories.tsx to compare against Apple Maps.
export const FullAddress: Story = {
  args: { park: buildPark() },
};

// FDR-style intersection — street can be approximate or blank per D12.
export const NoStreetAddress: Story = {
  args: { park: buildPark({ streetAddress: null }) },
};

// Hides silently — the stub fixture has no address fields and no coords.
export const Empty: Story = {
  args: { park: stubPark },
};
