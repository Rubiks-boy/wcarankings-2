import type { Meta, StoryObj } from "@storybook/react";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

const meta = {
  title: "App/PwaUpdatePrompt",
  component: PwaUpdatePrompt,
  args: {
    updating: false,
    onRefresh: () => undefined,
    onDismiss: () => undefined,
  },
} satisfies Meta<typeof PwaUpdatePrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpdateAvailable: Story = {};
export const Updating: Story = {
  args: {
    updating: true,
  },
};
