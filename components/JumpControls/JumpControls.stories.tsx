import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import type { RankingEntry } from "../RankingsExplorer/types";
import { JumpDownControls, JumpUpControls } from "./JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const matches: RankingEntry[] = [
  {
    rank: 1,
    subRank: 1,
    personId: "2017PARK03",
    personName: "Max Park",
    countryName: "United States",
    countryIso2: "US",
    best: 311,
    competitionId: "storybook-open-2026",
    competitionName: "Storybook Open 2026",
    recordBadges: [],
  },
];

function InteractiveTopRail() {
  const [eventId, setEventId] =
    useState<(typeof WCA_EVENTS)[number]["id"]>("333");
  const [query, setQuery] = useState("");
  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;

  return (
    <JumpControlsVisibility visible>
      <JumpUpControls
      armed
      currentPosition={1}
      onJump={() => undefined}
      event={event}
      onEventChange={setEventId}
      findQuery={query}
      findError=""
      findLoading={false}
      findPending={false}
      findMatches={matches}
      findIndex={0}
      onSearchOpen={() => undefined}
      onSearchClose={() => {
        setQuery("");
      }}
      onSearchQueryChange={setQuery}
      onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>
  );
}

const meta = {
  title: "Rankings/JumpControls",
  component: JumpDownControls,
  parameters: { layout: "fullscreen" },
  args: {
    armed: false,
    currentPosition: 100,
    total: 10_000,
    onJump: () => undefined,
    searchActive: false,
    onSearchPrevious: () => undefined,
    onSearchNext: () => undefined,
  },
} satisfies Meta<typeof JumpDownControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  render: () => <InteractiveTopRail />,
};

export const Bottom: Story = {
  args: { armed: true },
  render: (args) => (
    <JumpControlsVisibility visible>
      <JumpDownControls {...args} />
    </JumpControlsVisibility>
  ),
};
