import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { VimSearchInput } from "./VimSearchInput";

const match = {
  rank: 18,
  subRank: 18,
  personId: "2024WALK01",
  personName: "Cailyn Sinclair",
  countryName: "United States",
  countryIso2: "US",
  best: 1234,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
  recordBadges: [],
};

function InteractiveVimSearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("/Cailyn");
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <VimSearchInput
      inputRef={inputRef}
      value={value}
      vimMode={false}
      vimSearchActive
      findLoading={false}
      findPending={false}
      findQuery="Cailyn"
      activeFindMatch={match}
      findMatches={[match]}
      vimHelpOpen={helpOpen}
      onChange={setValue}
      onCycle={() => undefined}
      onToggleHelp={() => setHelpOpen((open) => !open)}
    />
  );
}

const meta = {
  title: "Components/VimSearchInput",
  component: VimSearchInput,
  parameters: { layout: "fullscreen" },
  args: {
    inputRef: { current: null },
    value: "/Cailyn",
    vimMode: false,
    vimSearchActive: true,
    findLoading: false,
    findPending: false,
    findQuery: "Cailyn",
    activeFindMatch: match,
    findMatches: [match],
    vimHelpOpen: false,
    onChange: () => undefined,
    onCycle: () => undefined,
    onToggleHelp: () => undefined,
  },
  render: () => <InteractiveVimSearchInput />,
} satisfies Meta<typeof VimSearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSearch: Story = {};
