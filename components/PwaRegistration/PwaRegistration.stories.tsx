import type { Meta, StoryObj } from "@storybook/react";
import {
  PwaRegistration,
  PwaUpdatePrompt,
} from "./PwaRegistration";

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

export const UpdateAvailable: Story = {
  render: () => (
    <PwaUpdatePrompt
      updating={false}
      onRefresh={() => undefined}
      onDismiss={() => undefined}
    />
  ),
};

export const Updating: Story = {
  render: () => (
    <PwaUpdatePrompt
      updating
      onRefresh={() => undefined}
      onDismiss={() => undefined}
    />
  ),
};
