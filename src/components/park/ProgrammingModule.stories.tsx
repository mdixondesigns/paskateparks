import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProgrammingModule } from "./ProgrammingModule";

const meta = {
  title: "Park/ProgrammingModule",
  component: ProgrammingModule,
} satisfies Meta<typeof ProgrammingModule>;

export default meta;
type Story = StoryObj<typeof meta>;

// Visual treatment (dark band + paint splashes + pull-quote per
// VISUAL-DESIGN.md §12) hasn't been applied yet — this is the bare
// structural version described in the component's own comment.
export const Default: Story = {
  args: { parkCity: "Philadelphia" },
};
