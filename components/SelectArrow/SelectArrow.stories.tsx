import type { Meta, StoryObj } from "@storybook/react";
import { SelectArrow } from "./SelectArrow";

const meta = {
  title: "UI/SelectArrow",
  component: SelectArrow,
} satisfies Meta<typeof SelectArrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
