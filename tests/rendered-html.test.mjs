import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the original WCA Rankings UI on the self-hosted API", async () => {
  const [component, layout, rankingsRoute] = await Promise.all([
    readFile(new URL("../app/components/RankingsExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rankings/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.match(layout, /images:\s*\[\{ url: "\/og\.png"/);
  assert.match(component, /useWindowVirtualizer/);
  assert.match(component, /const PAGE_SIZE = 100/);
  assert.match(component, /paged: "1"/);
  assert.match(component, /WCA Rankings/);
  assert.match(component, /href="https:\/\/wcarankings\.com"/);
  assert.match(component, /EVENTS_MAP/);
  assert.match(component, /className="chooser"/);
  assert.match(component, /className="selectInput"/);
  assert.match(component, /className=.*searchButton/);
  assert.match(component, /aria-label="Search names or WCA IDs"/);
  assert.match(component, /onClick={openFind}/);
  assert.match(component, /RegionPicker/);
  assert.match(component, /className="regionPickerTrigger"/);
  assert.match(component, /kind=continent/);
  assert.match(component, /kind=country/);
  assert.match(component, /label: "World"/);
  assert.doesNotMatch(component, /regionOptionIcon|flagEmoji/);
  assert.match(component, /className=\{`Jump Jump--up/);
  assert.match(component, /formatRankingNumber\(5000\)/);
  assert.match(component, /Jump to top/);
  assert.match(component, /Jump to end/);
  assert.match(component, /className="siteFooter"/);
  assert.match(component, /fetched time unavailable/);
  assert.match(component, /findBar--floating/);
  assert.match(component, /loadPrevious/);
  assert.match(component, /window\.scrollBy/);
  assert.match(component, /findBar/);
  assert.match(component, /Ctrl\+F/);
  assert.match(component, /Find a name or WCA ID/);
  assert.match(component, /searchRankings/);
  assert.match(component, /searchParams\.set\("search"/);
  assert.match(component, /searchParams\.get\("search"/);
  assert.match(component, /history\.replaceState/);
  assert.match(component, /cycleFind/);
  assert.match(component, /key === "f"/);
  assert.match(component, /key === "g"/);
  assert.match(component, /window\.innerHeight/);
  assert.match(component, /useIsomorphicLayoutEffect/);
  assert.match(component, /initialScrollRef/);
  assert.match(component, /initialSearchRef/);
  assert.match(component, /scrollToEntry\(listRef\.current, targetIndex, "center", "smooth"/);
  assert.match(component, /requestedBehavior: ScrollBehavior = "smooth"/);
  assert.match(component, /SCROLL_ANIMATION_DURATION_MS = 1600/);
  assert.match(component, /preserveListDuringLoad/);
  assert.match(component, /listItem/);
  assert.match(component, /className="loader"/);
  assert.match(component, /className=.*row/);
  assert.match(component, /className="competitionName"/);
  assert.match(component, /\{entry\.competitionName\}/);
  assert.match(component, /title={entry\.competitionName}/);
  assert.match(component, /rankingNumberFormatter/);
  assert.match(component, /formatRankingNumber\(rank\)/);
  assert.doesNotMatch(component, /header-controls|collapsed-filter-summary|table-quick-jump/);
  assert.match(rankingsRoute, /SELECT MIN\(\$\{rankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /SELECT MAX\(\$\{rankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /person_name ILIKE/);
  assert.match(rankingsRoute, /person_id ILIKE/);
  assert.match(rankingsRoute, /competition_id/);
  assert.match(rankingsRoute, /fetched_at/);
  assert.match(rankingsRoute, /ORDER BY \$\{rankColumn\}, person_id/);
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

  assert.match(page, /<RankingsExplorer initialData=\{initialRankings\}/);
  assert.match(page, /queryPostgres/);
  assert.match(page, /pageStartForRank/);
  assert.match(page, /searchParams/);
  assert.match(page, /const startRank = firstMatch \? pageStartForRank\(firstMatch\.rank\) : 1/);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.match(layout, /PwaRegistration/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(pwaRegistration, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /caches\.match/);
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /\.app\s*\{/);
  assert.match(css, /\.chooser\s*\{/);
  assert.match(css, /\.searchButton\s*\{/);
  assert.match(css, /\.selectInput select/);
  assert.match(css, /\.listItem/);
  assert.match(css, /\.loaderBlob/);
  assert.match(css, /\.Jump/);
  assert.match(css, /\.row--alternate/);
  assert.match(css, /\.listItem:hover \.row/);
  assert.match(css, /background-color 40ms ease/);
  assert.match(css, /\.competitionName \{[\s\S]*max-width: none;[\s\S]*overflow: visible;/);
  assert.match(css, /\.regionPickerMenu/);
  assert.match(css, /\.regionPickerTrigger/);
  assert.match(css, /\.regionOptions[\s\S]*overflow-y: auto/);
  assert.match(css, /\.findBar/);
  assert.match(css, /\.siteFooter/);
  assert.match(css, /\.row--searchMatch/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /app-header|table-quick-jump|jump-overlay/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);

  await assert.rejects(
    access(previewRoot),
  );
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("self-hosted ranking buckets preserve a tie larger than the page size", async (context) => {
  if (!process.env.DATABASE_URL) {
    context.skip("DATABASE_URL is not configured");
    return;
  }

  const { Client } = await import("pg");
  const database = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1000 });
  try {
    await database.connect();
    const table = await database.query("SELECT to_regclass('public.ranking_entries') AS name");
    if (!table.rows[0]?.name) {
      context.skip("self-hosted WCA database is not populated");
      return;
    }

    const tieResult = await database.query(
      `SELECT event_id, ranking_type, world_rank, COUNT(*) AS tied
       FROM ranking_entries
       GROUP BY event_id, ranking_type, world_rank
       HAVING COUNT(*) > 100
       ORDER BY tied DESC
       LIMIT 1`,
    );
    const tie = tieResult.rows[0];
    assert.ok(tie, "expected the official export to contain a tie larger than 100 people");

    const pageStart = Math.floor((Number(tie.world_rank) - 1) / 100) * 100 + 1;
    const pageRows = await database.query(
      `SELECT world_rank
       FROM ranking_entries
       WHERE event_id = $1 AND ranking_type = $2 AND world_rank >= $3 AND world_rank < $4`,
      [tie.event_id, tie.ranking_type, pageStart, pageStart + 100],
    );
    const tiedRows = pageRows.rows.filter((row) => Number(row.world_rank) === Number(tie.world_rank));
    assert.equal(tiedRows.length, Number(tie.tied));
    assert.ok(tiedRows.length > 100);
  } catch (error) {
    context.skip(`self-hosted WCA database is unavailable: ${error instanceof Error ? error.message : error}`);
  } finally {
    await database.end().catch(() => {});
  }
});
