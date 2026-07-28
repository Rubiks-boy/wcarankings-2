import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { RESULTS_PAGE_SIZE } from "../lib/rankings-config.ts";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the original WCA Rankings UI on the self-hosted API", async () => {
  const [component, scrollEngine, layout, rankingsRoute, rankingsConfig, wca] = await Promise.all([
    readFile(new URL("../app/components/RankingsExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/scrollEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rankings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rankings-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/wca.ts", import.meta.url), "utf8"),
  ]);
  const scrollSource = `${component}\n${scrollEngine}`;
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.doesNotMatch(layout, /og\.png|summary_large_image/);
  assert.match(component, /useWindowVirtualizer/);
  assert.match(rankingsConfig, /export const RESULTS_PAGE_SIZE = \d+/);
  assert.match(component, /const PAGE_SIZE = RESULTS_PAGE_SIZE/);
  assert.match(component, /const SEARCH_PAGE_RADIUS = 1/);
  assert.match(component, /const SEARCH_ANIMATION_ROWS = 3/);
  assert.match(component, /const VIM_JUMP_PAGE_COUNT = 2/);
  assert.match(component, /const VIM_JUMP_SIZE = PAGE_SIZE \* VIM_JUMP_PAGE_COUNT/);
  assert.match(rankingsRoute, /const PAGE_SIZE = RESULTS_PAGE_SIZE/);
  assert.match(rankingsRoute, /const MAX_PAGE_SIZE = RESULTS_PAGE_SIZE/);
  assert.match(component, /paged: "1"/);
  assert.match(component, /pageStartForSubRank/);
  assert.match(component, /Math\.floor\(\(Math\.max\(1, subRank\) - 1\) \/ PAGE_SIZE\) \* PAGE_SIZE/);
  assert.match(component, /getSearchWindow/);
  assert.match(component, /Promise\.all/);
  assert.match(component, /pages\.flatMap/);
  assert.match(component, /searchMatched=\{searchMatchPersonIds\.has\(/);
  assert.doesNotMatch(component, /focusBefore|focusPersonId/);
  assert.doesNotMatch(rankingsRoute, /focusBefore|focusPersonId/);
  assert.match(component, /WCA Rankings/);
  assert.match(component, /href="\/"/);
  assert.doesNotMatch(component, /href="https:\/\/wcarankings\.com"/);
  assert.match(component, /WCA_EVENTS\.map/);
  assert.match(component, /className="selectInput eventInput"/);
  assert.match(component, /className="rankingTypeToggle"/);
  assert.match(component, /type="radio"/);
  assert.match(component, /disabled=\{option === "average" && eventId === "333mbf"\}/);
  assert.match(component, /updateQueryParams/);
  assert.match(component, /eventId,/);
  assert.match(component, /result: rankingType/);
  assert.match(component, /eventId: nextEventId === "333" \? null : nextEventId/);
  assert.match(component, /result: nextRankingType === "single" \? null : nextRankingType/);
  assert.match(component, /parseRegionQuery/);
  assert.doesNotMatch(component, /searchParams\.get\("scope"\)/);
  assert.match(component, /region: option\.scope === "world" \? null : option\.regionId/);
  const wcaEventSource = wca.match(/export const WCA_EVENTS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.deepEqual(
    [...wcaEventSource.matchAll(/\{ id: "([^"]+)", name:/g)].map((match) => match[1]),
    ["333", "222", "444", "555", "666", "777", "333bf", "333fm", "333oh", "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf"],
  );
  assert.match(component, /className="chooser"/);
  assert.match(component, /className="selectInput(?: eventInput)?"/);
  assert.match(component, /className=.*searchButton/);
  assert.match(component, /aria-label="Search names or WCA IDs"/);
  assert.match(component, /onClick={openFind}/);
  assert.match(component, /RegionPicker/);
  assert.match(component, /className="regionPickerTrigger"/);
  assert.match(component, /initialRegions/);
  assert.match(component, /initialRegions\.continents/);
  assert.match(component, /initialRegions\.countries/);
  assert.match(component, /label: "World"/);
  assert.doesNotMatch(component, /regionOptionIcon|flagEmoji/);
  assert.match(component, /className=\{`Jump Jump--up/);
  assert.match(component, /formatRankingNumber\(5000\)/);
  assert.match(component, /Jump to top/);
  assert.match(component, /Jump to end/);
  assert.match(component, /className="siteFooter"/);
  assert.match(component, /fetched time unavailable/);
  assert.match(component, /findBar--floating/);
  assert.match(component, /findBarRef/);
  assert.match(component, /closeOnOutsideClick/);
  assert.match(component, /document\.addEventListener\("pointerdown"/);
  assert.match(component, /setFindFloating\(window\.scrollY > 0\)/);
  assert.match(component, /loadPrevious/);
  assert.match(component, /window\.scrollBy/);
  assert.match(component, /findBar/);
  assert.match(component, /Ctrl\+F/);
  assert.match(component, /Find a name or WCA ID/);
  assert.match(component, /searchRankings/);
  assert.match(component, /updateQueryParams\(\{ search:/);
  assert.match(component, /searchParams\.get\("search"/);
  assert.match(component, /history\.replaceState/);
  assert.match(component, /cycleFind/);
  assert.match(component, /orderSearchMatches/);
  assert.match(component, /\$\{findIndex \+ 1\} of \$\{findMatches\.length\}/);
  assert.doesNotMatch(component, /activeFindMatch\.subRank/);
  assert.match(component, /event\.shiftKey \? -1 : 1/);
  assert.match(component, /key === "f"/);
  assert.match(component, /setVimMode\(false\)/);
  assert.match(component, /findInputRef\.current\?\.select\(\)/);
  assert.match(component, /key === "g"/);
  assert.match(scrollSource, /window\.innerHeight/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /initialScrollRef/);
  assert.match(component, /initialSearchRef/);
  assert.match(component, /scrollToEntry\(\{[\s\S]*targetIndex/);
  assert.match(scrollSource, /requestedBehavior\?: ScrollBehavior/);
  assert.match(scrollEngine, /MIN_LOCAL_SCROLL_DURATION_MS = \d+/);
  assert.match(scrollEngine, /MAX_LOCAL_SCROLL_DURATION_MS = \d+/);
  assert.match(scrollEngine, /DISTANT_SCROLL_DURATION_MS = \d+/);
  assert.match(scrollSource, /getScrollAnimationDuration/);
  assert.match(scrollSource, /easeInOutCubic/);
  assert.doesNotMatch(scrollSource, /Math\.log10|BIG_JUMP|MEDIUM_JUMP/);
  assert.match(scrollEngine, /getSearchJumpMode/);
  assert.match(scrollEngine, /getSearchBridgePageStarts/);
  assert.match(scrollEngine, /MULTI_PAGE_SCROLL_DURATION_MS = \d+/);
  assert.match(component, /getDistantSearchWindow/);
  assert.match(component, /jumpMode === "multi-page"/);
  assert.match(component, /useLayoutEffect/);
  assert.match(component, /pendingSearchLayoutAnchorRef/);
  assert.match(component, /absoluteTop - anchor\.viewportTop/);
  assert.doesNotMatch(component, /progressiveJump|synthetic/i);
  assert.match(component, /rankingListRef/);
  assert.match(component, /searchTransformOffsetRef/);
  assert.match(component, /SEARCH_ANIMATION_ROWS \* ROW_HEIGHT/);
  assert.match(component, /translateY\(\$\{transformOffset\}px\)/);
  assert.match(component, /window\.scrollBy\(\{ top: -transformOffset, behavior: "auto" \}\)/);
  assert.doesNotMatch(
    rankingsRoute,
    /Math\.floor\(\(Number\(nextRankRow\.rank\) - 1\) \/ limit\)/
  );
  assert.match(
    rankingsRoute,
    /Math\.floor\(Math\.max\(0, requestedStart\) \/ PAGE_SIZE\) \* PAGE_SIZE \+ 1/
  );
  assert.match(
    rankingsRoute,
    /subRankColumn\} >= \$\{addParameter\(values, pageStartRank\)\} AND \$\{subRankColumn\} < \$\{addParameter\(values, pageStartRank \+ limit\)\}/
  );
  assert.match(component, /startPosition/);
  assert.match(component, /lastRank/);
  assert.match(component, /pendingScrollToTopRef/);
  assert.match(component, /shouldScrollToTarget/);
  assert.match(component, /shouldScrollToTarget = Boolean\([\s\S]*scrollToTop[\s\S]*pendingDirection[\s\S]*appendNavigation/);
  assert.match(component, /animateScrollTo\([\s\S]*?0,[\s\S]*?getScrollAnimationDuration\(currentPosition\)/);
  assert.match(component, /cancelOnUserInput/);
  assert.match(component, /navigationEpochRef/);
  assert.match(component, /requestEpoch !== navigationEpochRef\.current/);
  assert.match(component, /skipPageLoadStartRef/);
  assert.match(component, /rowVirtualizerRef/);
  assert.match(component, /pendingNavigationAppendRef/);
  assert.match(component, /const loadedEntries/);
  assert.match(component, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey\) return/);
  assert.match(component, /vimSearchActive && key === "n"/);
  assert.match(component, /addEventListener\("wheel"/);
  assert.match(component, /getOffsetForIndex/);
  assert.match(component, /measureElement/);
  assert.match(component, /preserveListDuringLoad/);
  assert.match(component, /listItem/);
  assert.match(component, /className=.*loaderRow/);
  assert.match(component, /className=.*row/);
  assert.match(component, /className="competitionName"/);
  assert.match(component, /\{entry\.competitionName\}/);
  assert.match(component, /title={entry\.competitionName}/);
  assert.match(component, /rankingNumberFormatter/);
  assert.match(component, /formatRankingNumber\(entry\.rank\)/);
  assert.match(component, /formatWcaResult\(eventId, entry\.best, rankingType\)/);
  assert.match(component, /command === "j"[\s\S]*currentRank \+ VIM_JUMP_SIZE/);
  assert.match(component, /command === "k"[\s\S]*currentRank - VIM_JUMP_SIZE/);
  assert.match(component, /const directVimCommand/);
  assert.match(component, /\["j", "k", "d", "u"\]\.includes\(directVimCommand\)/);
  assert.match(wca, /rankingType === "average" \? \(value \/ 100\)\.toFixed\(2\)/);
  assert.match(component, /const nextStart = pageStartForSubRank\(normalizedRank\) \+ 1/);
  assert.match(component, /const nextStart = pageStartForSubRank\(endRank\) \+ 1/);
  assert.doesNotMatch(component, /header-controls|collapsed-filter-summary|table-quick-jump/);
  assert.match(rankingsRoute, /SELECT MIN\(\$\{subRankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /SELECT MAX\(\$\{subRankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /person_name \$\{searchOperator\}/);
  assert.match(rankingsRoute, /person_id \$\{searchOperator\}/);
  assert.match(rankingsRoute, /searchNameParameter/);
  assert.match(rankingsRoute, /searchIdParameter/);
  assert.match(rankingsRoute, /competition_id/);
  assert.match(rankingsRoute, /fetched_at/);
  assert.match(rankingsRoute, /startPosition/);
  assert.match(rankingsRoute, /lastRank/);
  assert.match(rankingsRoute, /ORDER BY \$\{subRankColumn\}/);
  assert.match(rankingsRoute, /const limitParameter = paged \? "" :/);
});

test("uses the copied WCA Rankings visual language", async () => {
  const [css, page, layout, manifest, pwaRegistration, serviceWorker, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PwaRegistration.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RankingsExplorer/);
  assert.match(page, /initialData=\{initialRankings\}/);
  assert.match(page, /initialEventId=\{eventId\}/);
  assert.match(page, /initialRankingType=\{rankingType\}/);
  assert.match(page, /initialRegionSelection=\{\{ scope, regionId \}\}/);
  assert.match(page, /startPosition: firstPage\.startPosition/);
  assert.match(page, /lastRank: lastPage\.lastRank/);
  assert.match(page, /initialRegions=\{\{ continents, countries \}\}/);
  assert.match(page, /getRegions\("continent"\)/);
  assert.match(page, /getRegions\("country"\)/);
  assert.match(page, /redirect/);
  assert.match(page, /queryMysql/);
  assert.match(page, /getSearchParam\(resolvedSearchParams, "region"\)/);
  assert.match(page, /getSearchParamWithLegacyKey\(resolvedSearchParams, "eventId", "event"\)/);
  assert.match(page, /getSearchParamWithLegacyKey\(resolvedSearchParams, "result", "type"\)/);
  assert.match(page, /eventId/);
  assert.match(page, /result/);
  assert.doesNotMatch(page, /getSearchParam\(resolvedSearchParams, "scope"\)/);
  assert.match(page, /pageFirstSubRank/);
  assert.match(page, /searchParams/);
  assert.match(page, /const targetPageStart = pageFirstSubRank\(firstMatch\?\.subRank \?\? 1\)/);
  assert.match(page, /targetPageStart - PAGE_SIZE, targetPageStart, targetPageStart \+ PAGE_SIZE/);
  assert.match(page, /pages\.flatMap/);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.match(layout, /PwaRegistration/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(pwaRegistration, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(pwaRegistration, /process\.env\.NODE_ENV/);
  assert.match(pwaRegistration, /unregister\(\)/);
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /caches\.match/);
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /\.app\s*\{/);
  assert.match(css, /\.chooser\s*\{/);
  assert.match(css, /\.searchButton\s*\{/);
  assert.match(css, /\.selectInput select/);
  assert.match(css, /\.rankingTypeToggle/);
  assert.match(css, /\.rankingTypeOption/);
  assert.match(css, /\.selectInput select,[\s\S]*\.rankingTypeToggle,[\s\S]*\.regionPickerTrigger/);
  assert.match(css, /\.listItem/);
  assert.match(css, /overflow-anchor: none/);
  assert.match(css, /\.loaderBlob/);
  assert.match(css, /\.Jump/);
  assert.match(css, /\.row--alternate/);
  assert.match(css, /\.virtualRow:not\(:last-child\) \.row/);
  assert.match(css, /border-bottom: 1px solid #e5eaed/);
  assert.match(css, /\.listItem:hover \.row/);
  assert.match(css, /background-color 40ms ease/);
  assert.match(css, /\.competitionName \{[\s\S]*max-width: none;[\s\S]*overflow: visible;/);
  assert.match(css, /\.regionPickerMenu/);
  assert.match(css, /\.regionPickerTrigger/);
  assert.match(css, /\.regionOptions[\s\S]*overflow-y: auto/);
  assert.match(css, /\.findBar/);
  assert.match(css, /\.siteFooter/);
  assert.match(css, /\.row--searchResult/);
  assert.match(css, /\.row--searchMatch/);
  assert.doesNotMatch(css, /\.searchTopSpacer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /app-header|table-quick-jump|jump-overlay/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);

  await assert.rejects(
    access(previewRoot),
  );
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("self-hosted ranking buckets preserve a tie larger than the page size", async (context) => {
  if (!process.env.DATABASE_URL?.startsWith("mysql://")) {
    context.skip("MySQL DATABASE_URL is not configured");
    return;
  }

  const mysql = await import("mysql2/promise");
  const database = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [tableRows] = await database.query("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ranking_entries'");
    if (!tableRows[0]?.name) {
      context.skip("self-hosted WCA database is not populated");
      return;
    }

    const [tieRows] = await database.query(
      `SELECT event_id, ranking_type, world_rank, COUNT(*) AS tied
       FROM ranking_entries
       GROUP BY event_id, ranking_type, world_rank
       HAVING COUNT(*) > ${RESULTS_PAGE_SIZE}
       ORDER BY tied DESC
       LIMIT 1`,
    );
    const tie = tieRows[0];
    assert.ok(tie, `expected the official export to contain a tie larger than ${RESULTS_PAGE_SIZE} people`);

    const pageStart = Math.floor((Number(tie.world_rank) - 1) / RESULTS_PAGE_SIZE) * RESULTS_PAGE_SIZE + 1;
    const [pageRows] = await database.query(
      `SELECT world_rank
       FROM ranking_entries
       WHERE event_id = ? AND ranking_type = ? AND world_rank >= ? AND world_rank < ?`,
      [tie.event_id, tie.ranking_type, pageStart, pageStart + RESULTS_PAGE_SIZE],
    );
    const tiedRows = pageRows.filter((row) => Number(row.world_rank) === Number(tie.world_rank));
    assert.equal(tiedRows.length, Number(tie.tied));
    assert.ok(tiedRows.length > RESULTS_PAGE_SIZE);
  } catch (error) {
    context.skip(`self-hosted WCA database is unavailable: ${error instanceof Error ? error.message : error}`);
  } finally {
    await database.end().catch(() => {});
  }
});
