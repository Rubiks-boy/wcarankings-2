import type { Meta, StoryObj } from "@storybook/react";
import { JumpControls } from "./JumpControls";

const meta = {
  title: "Rankings/JumpControls",
  component: JumpControls,
  parameters: { layout: "fullscreen" },
  args: {
    direction: "down",
    visible: true,
    armed: false,
    currentPosition: 100,
    total: 10_000,
    onJump: () => undefined,
  },
} satisfies Meta<typeof JumpControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtEdge: Story = { args: { armed: true } };
export const Up: Story = { args: { direction: "up" } };
