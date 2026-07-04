import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ParkRules } from "./ParkRules";
import { buildPark } from "@/lib/park-fixtures";

const meta = {
  title: "Park/ParkRules",
  component: ParkRules,
} satisfies Meta<typeof ParkRules>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVehiclesAllowed: Story = {
  args: { park: buildPark() },
};

export const SomeVehiclesDisallowed: Story = {
  args: {
    park: buildPark({
      allowsBikes: false,
      allowsScooters: false,
      vehicleRulesNotes: "No bikes or scooters during weekend competition hours.",
      helmets: "required_under_12",
      otherPadsRequired: true,
      fee: true,
    }),
  },
};

export const HelmetsRequiredAllAges: Story = {
  args: { park: buildPark({ helmets: "required_all_ages" }) },
};
