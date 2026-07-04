import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Obstacles } from "./Obstacles";
import { richPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/Obstacles",
  component: Obstacles,
} satisfies Meta<typeof Obstacles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { obstacles: richPark.obstacles },
};

// The full 38-term taxonomy — worth checking wrap behavior with the max
// realistic chip count per SITE-AUDIT.md §4.
export const AllThirtyEight: Story = {
  args: {
    obstacles: [
      "grind_box_ledge",
      "quarter_pipe",
      "flat_rail",
      "bank_wedge",
      "hubba",
      "manual_pad",
      "funbox",
      "hip",
      "handrail",
      "curb",
      "pyramid",
      "kicker_launch_ramp",
      "stair",
      "wallride",
      "mini_ramp",
      "spine",
      "euro_london_gap",
      "pool_bowl",
      "extension",
      "gap",
      "roll_in",
      "volcano",
      "jersey_barrier",
      "a_frame",
      "amoeba_pool",
      "box_jump",
      "picnic_table",
      "pole",
      "rainbow_rail",
      "escalator",
      "full_pipe",
      "cradle_over_vert",
      "snake_run",
      "fire_hydrant",
      "whoop_dee_doo",
      "foam_pit",
      "mega_ramp",
      "pump_track",
    ],
  },
};

export const Empty: Story = {
  args: { obstacles: [] },
};
