import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingsExplorer } from "./RankingsExplorer";

test("renders the rankings shell with extracted components", () => {
  const markup = renderToStaticMarkup(
    <RankingsExplorer
      initialData={{
        entries: [
          {
            rank: 1,
            subRank: 1,
            personId: "2024AVERY01",
            personName: "Avery Chen",
            countryName: "United States",
            countryIso2: "US",
            best: 512,
            competitionId: "storybook-open",
            competitionName: "Storybook Open 2026",
            recordBadges: ["NR"],
          },
        ],
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        startRank: 1,
        startPosition: 0,
        lastRank: 1,
        total: 1,
        fetchedAt: null,
        searchMatches: [],
        initialMatchPersonId: "",
      }}
      initialRegions={{ continents: [], countries: [] }}
    />,
  );
  assert.match(markup, /WCA Rankings/);
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
});
