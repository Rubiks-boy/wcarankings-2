import type { Meta, StoryObj } from "@storybook/react";
import { Arrow } from "./Arrow";

const meta = {
  title: "UI/Arrow",
  component: Arrow,
  args: { direction: "up" },
} satisfies Meta<typeof Arrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Up: Story = {};
export const Down: Story = { args: { direction: "down" } };
