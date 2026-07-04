import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatusBanner } from "./StatusBanner";

const meta = {
  title: "Park/StatusBanner",
  component: StatusBanner,
} satisfies Meta<typeof StatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// D11 — silent when open. Renders nothing; the canvas will look empty, which
// is the correct behavior to verify.
export const Open: Story = {
  args: { status: "open", reopenExpectedAt: null },
};

export const TemporarilyClosedWithReopenDate: Story = {
  args: { status: "temporarily_closed", reopenExpectedAt: "2026-08-01" },
};

export const TemporarilyClosedNoDate: Story = {
  args: { status: "temporarily_closed", reopenExpectedAt: null },
};

export const PermanentlyClosed: Story = {
  args: { status: "permanently_closed", reopenExpectedAt: null },
};
