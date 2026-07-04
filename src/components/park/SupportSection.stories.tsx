import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SupportSection } from "./SupportSection";
import { richPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/SupportSection",
  component: SupportSection,
} satisfies Meta<typeof SupportSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { links: richPark.links },
};

export const AllPlatforms: Story = {
  args: {
    links: [
      {
        id: 1,
        parkId: 1,
        type: "gofundme",
        url: "https://gofundme.com/example",
        label: null,
        sortOrder: 0,
      },
      {
        id: 2,
        parkId: 1,
        type: "venmo",
        url: "https://venmo.com/example",
        label: "@example",
        sortOrder: 1,
      },
      {
        id: 3,
        parkId: 1,
        type: "patreon",
        url: "https://patreon.com/example",
        label: null,
        sortOrder: 2,
      },
      {
        id: 4,
        parkId: 1,
        type: "donate",
        url: "https://example.com/donate",
        label: null,
        sortOrder: 3,
      },
      {
        id: 5,
        parkId: 1,
        type: "givebutter",
        url: "https://givebutter.com/example",
        label: null,
        sortOrder: 4,
      },
      {
        id: 6,
        parkId: 1,
        type: "paypal",
        url: "https://paypal.me/example",
        label: null,
        sortOrder: 5,
      },
    ],
  },
};

export const Empty: Story = {
  args: { links: [] },
};
