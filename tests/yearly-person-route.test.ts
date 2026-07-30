import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("passes the path year into the initial server rankings request", async () => {
  const source = await readFile(
    new URL("../app/RankingsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const year = yearOverride === null[\s\S]*String\(yearOverride\)/,
  );
  assert.match(
    source,
    /getInitialRankings\([\s\S]*resolvedSearchParams,[\s\S]*focusedWcaId,[\s\S]*initialYear,[\s\S]*\)/,
  );
});
