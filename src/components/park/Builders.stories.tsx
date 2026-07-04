import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Builders } from "./Builders";

const meta = {
  title: "Park/Builders",
  component: Builders,
} satisfies Meta<typeof Builders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleWithLink: Story = {
  args: {
    builders: [
      {
        id: 1,
        name: "Grindline Skateparks",
        url: "https://grindline.com",
        logoPath: null,
        wpPostId: null,
      },
    ],
  },
};

// D6 — empty link state renders as plain text (e.g. DIY builds).
export const MultipleMixedLinkState: Story = {
  args: {
    builders: [
      { id: 1, name: "DIY", url: null, logoPath: null, wpPostId: null },
      {
        id: 2,
        name: "5th Pocket Skateparks",
        url: "https://5thpocket.com",
        logoPath: null,
        wpPostId: null,
      },
      {
        id: 3,
        name: "Spohn Ranch Skateparks",
        url: "https://spohnranch.com",
        logoPath: null,
        wpPostId: null,
      },
    ],
  },
};

export const Empty: Story = {
  args: { builders: [] },
};
