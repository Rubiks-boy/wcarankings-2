import type { Meta, StoryObj } from "@storybook/react";
import { PwaRegistration } from "./PwaRegistration";

const meta = {
  title: "App/PwaRegistration",
  component: PwaRegistration,
  parameters: {
    docs: {
      description: {
        component:
          "Behavior-only component that registers the service worker and renders no visible UI.",
      },
    },
  },
} satisfies Meta<typeof PwaRegistration>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
