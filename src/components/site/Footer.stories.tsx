import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Footer } from "./Footer";

const meta = {
  title: "Site/Footer",
  component: Footer,
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default pathname (see .storybook/preview.tsx) is a park page, so the
// footer renders normally here.
export const Default: Story = {};

// Hides itself on the homepage — HomeFooter (src/components/home/HomeFooter.tsx)
// takes over there instead. This story should render nothing.
export const HiddenOnHomepage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/" } },
  },
};
