import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { HoursStanzas } from "./HoursStanzas";

const meta = {
  title: "Park/HoursStanzas",
  component: HoursStanzas,
} satisfies Meta<typeof HoursStanzas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLine: Story = {
  args: { hours: "Dawn to dusk, daily" },
};

// D13 — line breaks render as stanzas, e.g. seasonal splits.
export const MultipleStanzas: Story = {
  args: {
    hours:
      "Summer (May–Sept): 7am–10:30pm daily\nWinter (Oct–Apr): 9am–dusk daily\nClosed Thanksgiving and Christmas Day",
  },
};

export const Empty: Story = {
  args: { hours: null },
};
