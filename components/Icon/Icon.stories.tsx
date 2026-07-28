import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./Icon";

const meta = {
  title: "UI/Icon",
  component: Icon,
  args: { name: "search" },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Search: Story = {};
export const Select: Story = { args: { name: "select" } };
export const ArrowUp: Story = { args: { name: "arrow", direction: "up" } };
export const ArrowDown: Story = {
  args: { name: "arrow", direction: "down" },
};

