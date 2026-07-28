import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("implements the permanent registry and semantic projection grains", async () => {
  const [schema, facts, people, results, metrics, scores, podiums, competitionEvents, cities, importer] =
    await Promise.all([
      readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_facts.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_event_rankings.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_rankings.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_values.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_scores.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_podium_members.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_event_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/city_event_stats.sql", root), "utf8"),
      readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    ]);

  assert.match(schema, /PROJECTION_REGISTRY/);
  assert.match(schema, /dependencies/);
  assert.match(schema, /build:/);
  assert.match(schema, /validate:/);
  assert.match(schema, /durationMs/);
  assert.match(schema, /rowCounts/);
  assert.match(importer, /promoteProjectionTables/);

  assert.match(facts, /CREATE TABLE result_facts AS/);
  assert.match(facts, /FROM results r/);
  assert.doesNotMatch(facts, /AS value1/);
  assert.match(facts, /format\.expected_solve_count/);
  assert.match(facts, /idx_result_facts_single_ranking_cover/);
  assert.match(facts, /idx_result_facts_average_ranking_cover/);
  assert.match(people, /CREATE TABLE person_event_rankings AS/);
  assert.match(people, /world_position/);
  assert.match(results, /CREATE TABLE result_rankings AS/);
  assert.match(results, /competition_start_date/);
  assert.doesNotMatch(results, /ROW_NUMBER\(\)/);
  assert.match(metrics, /metric_version/);
  assert.match(metrics, /event_set_version/);
  assert.match(metrics, /sum_of_ranks_value/);
  assert.match(metrics, /kinch_value/);
  assert.match(scores, /required_coverage/);
  assert.match(scores, /CREATE TABLE person_metric_counts AS/);
  assert.match(podiums, /podium_position/);
  assert.match(podiums, /is_final_round = 1/);
  assert.match(competitionEvents, /fastest_single_result_id/);
  assert.match(competitionEvents, /winning_average_result_id/);
  assert.match(cities, /fastest_average_result_id/);
});

test("does not introduce entries or sub-rank vocabulary in new schemas", async () => {
  const files = [
    "person_event_rankings.sql",
    "result_rankings.sql",
    "person_metric_values.sql",
    "person_metric_scores.sql",
    "competition_podium_members.sql",
    "competition_event_stats.sql",
    "competition_stats.sql",
    "city_event_stats.sql",
  ];
  const sources = await Promise.all(files.map((file) =>
    readFile(new URL(`sql/ranking-projections/${file}`, root), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /_entries\b/);
    assert.doesNotMatch(source, /sub_rank/);
  }
});

test("person search resolves IDs before querying projections", async () => {
  const [search, rankings, results, compatibilityResults] = await Promise.all([
    readFile(new URL("lib/person-search.ts", root), "utf8"),
    readFile(new URL("lib/rankings.ts", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_rankings.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_entries_single_indexes.sql", root), "utf8"),
  ]);

  assert.match(search, /FROM persons/);
  assert.match(search, /wca_id = \?/);
  assert.match(search, /name LIKE \?/);
  assert.match(rankings, /searchPersonIds/);
  assert.match(rankings, /person_id IN/);
  assert.doesNotMatch(rankings, /person_name \$\{operator\}/);
  assert.match(results, /person_id, competition_start_date DESC, result_id DESC/);
  assert.match(compatibilityResults, /person_id, competition_date DESC, result_id DESC/);
  assert.match(compatibilityResults, /person_id, event_id, world_sub_rank, result_id/);
});
