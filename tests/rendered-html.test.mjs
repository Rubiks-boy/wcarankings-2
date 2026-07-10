import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the CubeRanks product shell", async () => {
  const [component, layout, rankingsRoute] = await Promise.all([
    readFile(new URL("../app/components/RankingsExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rankings/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /CubeRanks — WCA Rankings/);
  assert.match(layout, /images:\s*\[\{ url: "\/og\.png"/);
  assert.match(component, /useWindowVirtualizer/);
  assert.match(component, /const PAGE_SIZE = 100/);
  assert.match(component, /paged: "1"/);
  assert.match(component, /autoComplete="off"/);
  assert.match(component, /className="header-controls"/);
  assert.match(component, /collapsed-filter-summary/);
  assert.match(component, /Math\.sign\(delta\)/);
  assert.match(component, /directionDistance >= 10/);
  assert.match(component, /scrollToTableTop/);
  assert.match(component, /loadPrevious/);
  assert.match(component, /window\.scrollBy/);
  assert.match(component, /jump-scroll-track/);
  assert.match(component, /preserveCollapsedJumpRef/);
  assert.match(component, /finishPreservedJump/);
  assert.match(component, /preserveCurrentViewport/);
  assert.match(component, /initialLoadRef/);
  assert.match(component, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(component, /getBoundingClientRect\(\)\.top \+ window\.scrollY/);
  assert.match(component, /"\+10,000" : "-10,000"/);
  assert.doesNotMatch(component, /Scrolling down|Landing at|10,000 rows/);
  assert.match(component, /table-quick-jump-up/);
  assert.match(component, /table-quick-jump-down/);
  assert.match(component, /className="mobile-country"/);
  assert.match(component, /visibleRank > 10_000/);
  assert.match(component, /visibleRank >= 25 && hasMore/);
  assert.match(component, /visibleRank >= 25 && visibleRank <= 10_000/);
  assert.match(component, /↑ Top/);
  assert.match(component, /table-quick-jump-up\$\{visibleRank > 10_000 \? " is-visible"/);
  assert.doesNotMatch(component, /className="list-summary"/);
  assert.doesNotMatch(component, /data-status/);
  assert.match(rankingsRoute, /SELECT MIN\(\$\{rankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /SELECT MAX\(\$\{rankColumn\}\) AS rank/);
  assert.match(rankingsRoute, /paged \? "" : " LIMIT \?"/);
  assert.doesNotMatch(component, /header-done|collapsed-filter-action|manualHeaderOpen/);
  assert.doesNotMatch(component, /className="hero"|site-footer|ranking-scroll/);
  assert.doesNotMatch(component, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter artifacts and declares the real product", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RankingsExplorer \/>/);
  assert.match(layout, /title:\s*"CubeRanks/);
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.jump-overlay/);
  assert.doesNotMatch(css, /html\s*\{[^}]*scroll-behavior:\s*smooth/s);
  assert.doesNotMatch(css, /app-header-collapsed \.brand > span:last-child/);
  const tableHeadingRules = css.match(/\.table-heading\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(tableHeadingRules, /position:\s*sticky/);
  assert.match(css, /\.app-header-expanded \.header-inner\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /\.table-quick-jump\.is-visible/);
  assert.match(css, /scale 150ms ease/);
  assert.match(css, /--jump-hidden-y:\s*-8px/);
  assert.match(css, /--jump-hidden-y:\s*8px/);
  assert.match(css, /opacity 440ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(css, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.doesNotMatch(css, /\.app-header-expanded \.header-controls > \*:nth-child/);
  assert.match(css, /translate var\(--header-motion-duration\) var\(--header-motion-easing\)/);
  assert.match(css, /height 400ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.match(css, /--header-motion-easing:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);

  await assert.rejects(
    access(previewRoot),
  );
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("local ranking buckets preserve a tie larger than the page size", async (context) => {
  const d1Directory = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
  let files;
  try {
    files = await readdir(d1Directory);
  } catch {
    context.skip("local WCA database is not populated");
    return;
  }
  const databaseFile = files.find((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  if (!databaseFile) {
    context.skip("local WCA database is not populated");
    return;
  }

  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(new URL(databaseFile, d1Directory), { readOnly: true });
  try {
    const tie = database.prepare(
      `SELECT event_id, ranking_type, world_rank, COUNT(*) AS tied
       FROM ranking_entries
       GROUP BY event_id, ranking_type, world_rank
       HAVING COUNT(*) > 100
       ORDER BY tied DESC
       LIMIT 1`,
    ).get();
    assert.ok(tie, "expected the official export to contain a tie larger than 100 people");

    const pageStart = Math.floor((Number(tie.world_rank) - 1) / 100) * 100 + 1;
    const pageRows = database.prepare(
      `SELECT world_rank
       FROM ranking_entries
       WHERE event_id = ? AND ranking_type = ? AND world_rank >= ? AND world_rank < ?`,
    ).all(tie.event_id, tie.ranking_type, pageStart, pageStart + 100);
    const tiedRows = pageRows.filter((row) => row.world_rank === tie.world_rank);
    assert.equal(tiedRows.length, tie.tied);
    assert.ok(tiedRows.length > 100);
  } finally {
    database.close();
  }
});
