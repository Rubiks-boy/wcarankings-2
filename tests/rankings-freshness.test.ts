import assert from "node:assert/strict";
import test from "node:test";
import { formatRankingsFreshness } from "@/components/RankingsExplorer/types";

test("labels the WCA export date ahead of the local import time", () => {
  assert.equal(
    formatRankingsFreshness("2026-07-28", "2026-07-28T12:35:57Z"),
    "WCA export dated Jul 28, 2026",
  );
});

test("uses the import time only when export metadata is unavailable", () => {
  assert.match(
    formatRankingsFreshness(null, new Date().toISOString()),
    /^Imported just now$/,
  );
  assert.equal(
    formatRankingsFreshness(null, null),
    "WCA export date unavailable",
  );
});
