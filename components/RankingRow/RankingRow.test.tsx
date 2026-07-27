import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
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
  assert.match(markup, /rank--duplicate/);
  assert.doesNotMatch(markup, /sub-rank/);
});
