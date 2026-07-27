import type { Meta, StoryObj } from "@storybook/react";
import { RankingRow } from "./RankingRow";

const entry = {
  rank: 42,
  subRank: 42,
  personId: "2024WALK01",
  personName: "Cailyn Sinclair",
  best: 1234,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
};

const meta = {
  title: "Rankings/RankingRow",
  component: RankingRow,
  parameters: { layout: "fullscreen" },
  args: {
    entry,
    eventId: "333",
    rankingType: "single",
    loading: false,
    animationIndex: 0,
  },
} satisfies Meta<typeof RankingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TiedRank: Story = { args: { rankIsDuplicate: true } };
export const Highlighted: Story = { args: { highlighted: true } };
export const Loading: Story = { args: { entry: null, loading: true } };
