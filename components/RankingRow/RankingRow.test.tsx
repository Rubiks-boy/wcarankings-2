import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RankingEntry } from "../RankingsExplorer/types";
import { RankingRow } from "./RankingRow";

const entry: RankingEntry = {
  rank: 42,
  subRank: 42,
    personId: "2024WALK01",
    personName: "Cailyn Sinclair",
    countryName: "United States",
    countryIso2: "US",
    best: 1234,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: ["WR", "NR"],
};

test("renders a result row without exposing internal ordering", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={entry}
      eventId="333"
      rankingType="single"
      loading={false}
      animationIndex={0}
      rankIsDuplicate
    />
  );
  assert.match(markup, /Cailyn Sinclair/);
  assert.match(markup, /Storybook Open 2026/);
  assert.match(markup, /World Record/);
  assert.match(markup, /National Record/);
  assert.match(markup, /United States/);
  assert.match(markup, /rank--duplicate/);
  assert.doesNotMatch(markup, /sub-rank/);
});
