import type { Meta, StoryObj } from "@storybook/react";
import { ResultsTable } from "./ResultsTable";

const entries = [
  {
    rank: 1,
    subRank: 1,
    personId: "2024FAST01",
    personName: "Fast Solver",
    best: 512,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
  },
  {
    rank: 2,
    subRank: 2,
    personId: "2024TIED01",
    personName: "Tied Solver",
    best: 600,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
  },
  {
    rank: 2,
    subRank: 3,
    personId: "2024TIED02",
    personName: "Another Solver",
    best: 600,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
  },
];

const meta = {
  title: "Rankings/ResultsTable",
  component: ResultsTable,
  parameters: { layout: "fullscreen" },
  args: {
    entries,
    renderedRows: entries.map((_, index) => ({ index, key: index, start: index * 61.6 })),
    renderedListHeight: entries.length * 61.6,
    listOffset: 0,
    eventId: "333",
    rankingType: "single",
    loading: false,
    preserveListDuringLoad: false,
    loadingMore: false,
    highlightedPersonId: "",
    measureElement: () => undefined,
  },
} satisfies Meta<typeof ResultsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { loading: true } };
export const Highlighted: Story = { args: { highlightedPersonId: "2024TIED02" } };
