import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import { ALL_EVENT_RANKING_OPTIONS } from "../EventPicker/allEventRankingOptions";
import type { EventPickerOption } from "../EventPicker/EventPicker";
import type { RankingEntry, RegionOption } from "../RankingsExplorer/types";
import { RankingsControlsRail, RankingsPagerRail } from "./RankingsRail";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const eventOptions = WCA_EVENTS satisfies readonly EventPickerOption[];
const allEventOptions = [...WCA_EVENTS, ...ALL_EVENT_RANKING_OPTIONS] as const;
type RailEvent = (typeof allEventOptions)[number];

const matches: RankingEntry[] = [{ rank: 1, subRank: 1, personId: "2017PARK03", personName: "Max Park", countryName: "United States", countryIso2: "US", best: 311, competitionId: "storybook-open-2026", competitionName: "Storybook Open 2026", recordBadges: [] }];
const regions: RegionOption[] = [
  { key: "world", scope: "world", regionId: "", label: "World" },
  { key: "country:US", scope: "country", regionId: "US", label: "United States" },
];

function InteractiveTopRail() {
  const [eventId, setEventId] = useState<RailEvent["id"]>("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState({ scope: "world" as const, regionId: "" });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const event = allEventOptions.find((candidate) => candidate.id === eventId)!;
  const isAllEventRanking = ALL_EVENT_RANKING_OPTIONS.some((option) => option.id === event.id);

  return (
    <div style={{ padding: "3rem", minHeight: "18rem" }}>
      <JumpControlsVisibility visible>
        <RankingsControlsRail
          event={event}
          eventOptions={eventOptions}
          additionalEventOptions={ALL_EVENT_RANKING_OPTIONS}
          onEventChange={setEventId}
          rankingType={rankingType}
          onRankingTypeChange={setRankingType}
          regions={regions}
          regionSelection={regionSelection}
          onRegionChange={setRegionSelection}
          findOpen={searchOpen}
          findQuery={query}
          findError=""
          findLoading={false}
          findPending={false}
          findMatches={matches}
          findIndex={0}
          onSearchOpen={() => setSearchOpen(true)}
          onSearchClose={() => setSearchOpen(false)}
          onSearchQueryChange={setQuery}
          onSearchCycle={() => undefined}
        />
      </JumpControlsVisibility>
      <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>
        {isAllEventRanking ? `All-person rankings · ${event.name}` : `Event rankings · ${event.name}`}
      </p>
    </div>
  );
}

const meta = {
  title: "Components/RankingsRail",
  component: RankingsControlsRail,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RankingsControlsRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = { render: () => <InteractiveTopRail /> };

export const Bottom: Story = {
  render: () => (
    <div style={{ padding: "3rem" }}>
      <JumpControlsVisibility visible>
        <RankingsPagerRail
          upArmed={false}
          downArmed={false}
          currentPosition={5_001}
          total={10_000}
          onJumpUp={() => undefined}
          onJumpDown={() => undefined}
          searchActive={false}
          onSearchPrevious={() => undefined}
          onSearchNext={() => undefined}
        />
      </JumpControlsVisibility>
    </div>
  ),
};
