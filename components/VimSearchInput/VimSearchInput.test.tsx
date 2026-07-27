import assert from "node:assert/strict";
import test from "node:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VimSearchInput } from "./VimSearchInput";

test("renders regex search status without internal ordering details", () => {
  const markup = renderToStaticMarkup(
    <VimSearchInput
      inputRef={createRef<HTMLInputElement>()}
      value="/Avery"
      vimMode={false}
      vimSearchActive
      findLoading={false}
      findPending={false}
      findQuery="Avery"
      activeFindMatch={{
        rank: 3,
        subRank: 3,
        personId: "2024AVERY01",
        personName: "Avery Chen",
        best: 700,
        competitionId: "open",
        competitionName: "Open",
      }}
      findMatches={[]}
      vimHelpOpen={false}
      onChange={() => undefined}
      onCycle={() => undefined}
      onToggleHelp={() => undefined}
    />,
  );
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
});
