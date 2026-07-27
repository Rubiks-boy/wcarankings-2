import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
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
    rank: 1,
    subRank: 2,
    personId: "2024TIED01",
    personName: "Tied Solver",
    best: 512,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
  },
];

test("renders rows and highlights tied results", () => {
  const markup = renderToStaticMarkup(
    <ResultsTable
      entries={entries}
      renderedRows={entries.map((_, index) => ({ index, key: index, start: index * 61.6 }))}
      renderedListHeight={123.2}
      listOffset={0}
      eventId="333"
      rankingType="single"
      loading={false}
      preserveListDuringLoad={false}
      loadingMore={false}
      highlightedPersonId="2024TIED02"
      measureElement={() => undefined}
    />,
  );
  assert.match(markup, /Fast Solver/);
  assert.match(markup, /Tied Solver/);
  assert.match(markup, /rank--duplicate/);
});
