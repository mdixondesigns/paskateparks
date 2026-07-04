import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ConnectSection } from "./ConnectSection";
import { richPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/ConnectSection",
  component: ConnectSection,
} satisfies Meta<typeof ConnectSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { links: richPark.links },
};

export const AllPlatforms: Story = {
  args: {
    links: [
      { id: 1, parkId: 1, type: "website", url: "https://example.com", label: null, sortOrder: 0 },
      {
        id: 2,
        parkId: 1,
        type: "instagram",
        url: "https://instagram.com/example",
        label: "@example",
        sortOrder: 1,
      },
      {
        id: 3,
        parkId: 1,
        type: "facebook",
        url: "https://facebook.com/example",
        label: null,
        sortOrder: 2,
      },
      {
        id: 4,
        parkId: 1,
        type: "twitter",
        url: "https://twitter.com/example",
        label: null,
        sortOrder: 3,
      },
      {
        id: 5,
        parkId: 1,
        type: "youtube",
        url: "https://youtube.com/@example",
        label: null,
        sortOrder: 4,
      },
      {
        id: 6,
        parkId: 1,
        type: "tiktok",
        url: "https://tiktok.com/@example",
        label: null,
        sortOrder: 5,
      },
    ],
  },
};

// Hides silently — only Support-type links present, nothing for Connect.
export const Empty: Story = {
  args: { links: [] },
};
