import assert from "node:assert/strict";
import test from "node:test";
import { buildMatrixEntries, getSupportedMatrixEventIds, type MatrixSourceRow } from "@/lib/ranking-matrix";
import { parseRankingView } from "@/lib/ranking-views";

const base = {
  country_name: "United States",
  country_iso2: "US",
};

test("uses a complete, documented event set for each matrix type", () => {
  assert.equal(getSupportedMatrixEventIds("sor", "single").length, 17);
  assert.equal(getSupportedMatrixEventIds("sor", "average").length, 16);
  assert.equal(getSupportedMatrixEventIds("kinch", "single").includes("333mbf"), false);
  assert.equal(parseRankingView("invalid"), "wca");
});

test("calculates Kinch from the scope reference and ranks ties deterministically", () => {
  const rows: MatrixSourceRow[] = [
    { ...base, event_id: "333", person_id: "A", person_name: "Alex", rank: 1, best: 100, reference_best: 100 },
    { ...base, event_id: "222", person_id: "A", person_name: "Alex", rank: 2, best: 200, reference_best: 100 },
    { ...base, event_id: "333", person_id: "B", person_name: "Blair", rank: 2, best: 200, reference_best: 100 },
    { ...base, event_id: "222", person_id: "B", person_name: "Blair", rank: 1, best: 100, reference_best: 100 },
  ];
  const entries = buildMatrixEntries({ view: "kinch", eventIds: ["333", "222"], rows, search: "" });

  assert.deepEqual(entries.map(({ personId, rank, overall }) => [personId, rank, overall]), [
    ["A", 1, 75],
    ["B", 1, 75],
  ]);
  assert.equal(entries[0]?.eventValues["222"]?.kinch, 50);
});

test("sums ranks, keeps a deterministic secondary order, and filters WCA IDs", () => {
  const rows: MatrixSourceRow[] = [
    { ...base, event_id: "333", person_id: "2016ALEX01", person_name: "Alex", rank: 1, best: 100, reference_best: null },
    { ...base, event_id: "222", person_id: "2016ALEX01", person_name: "Alex", rank: 3, best: 100, reference_best: null },
    { ...base, event_id: "333", person_id: "2016BLAI01", person_name: "Blair", rank: 2, best: 100, reference_best: null },
    { ...base, event_id: "222", person_id: "2016BLAI01", person_name: "Blair", rank: 2, best: 100, reference_best: null },
  ];
  const entries = buildMatrixEntries({ view: "sor", eventIds: ["333", "222"], rows, search: "BLAI" });

  assert.deepEqual(entries.map(({ personId, rank, overall }) => [personId, rank, overall]), [
    ["2016BLAI01", 1, 4],
  ]);
});
