import type { Meta, StoryObj } from "@storybook/react";
import { PwaRegistration } from "./PwaRegistration";

const meta = {
  title: "App/PwaRegistration",
  component: PwaRegistration,
  parameters: {
    docs: {
      description: {
        component:
          "Registers the service worker and offers to refresh when an update is ready.",
      },
    },
  },
} satisfies Meta<typeof PwaRegistration>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
