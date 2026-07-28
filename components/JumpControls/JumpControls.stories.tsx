import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import type { RankingEntry } from "../RankingsExplorer/types";
import { JumpControls } from "./JumpControls";
import { SearchInputs } from "../SearchInputs/SearchInputs";

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
  const [eventId, setEventId] = useState("333");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;

  return (
    <JumpControls
      direction="up"
      visible
      armed
      currentPosition={1}
      total={10_000}
      onJump={() => undefined}
      eventIcon={eventId}
      eventLabel={event.name}
      eventOptions={WCA_EVENTS}
      onEventChange={setEventId}
      searchControl={
        <SearchInputs
          findOpen={searchOpen}
          findQuery={query}
          findError=""
          findLoading={false}
          findPending={false}
          findMatches={matches}
          findIndex={0}
          activeFindMatch={query ? matches[0] : null}
          onOpen={() => setSearchOpen(true)}
          onClose={() => {
            setSearchOpen(false);
            setQuery("");
          }}
          onQueryChange={setQuery}
          onCycle={() => undefined}
          inRail
        />
      }
    />
  );
}

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

export const Top: Story = {
  render: () => <InteractiveTopRail />,
};

export const Bottom: Story = {
  args: { direction: "down", armed: true },
};
