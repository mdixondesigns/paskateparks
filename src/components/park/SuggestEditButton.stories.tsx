import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SuggestEditButton } from "./SuggestEditButton";

const meta = {
  title: "Park/SuggestEditButton",
  component: SuggestEditButton,
} satisfies Meta<typeof SuggestEditButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Click the button to lazy-load and open SuggestEditModal. The form renders
// and validates normally; submitting will fail here since there's no
// /api/suggestions route running under Storybook — that's expected, this
// story is for tuning the trigger + modal layout, not the submit flow.
export const Default: Story = {
  args: { parkId: 1, parkSlug: "fdr-skatepark", parkName: "FDR Skatepark" },
};
