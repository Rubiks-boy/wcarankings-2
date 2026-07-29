import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps future grains registered while activating only Sum of Ranks", async () => {
  const [schema, facts, people, results, metricValues, metricScores, sumValues, sumScores, podiums, competitionEvents, competitions, cities, counts, importer] =
    await Promise.all([
      readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_facts.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_event_rankings.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_rankings.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_values.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_scores.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_sum_of_ranks_event_values.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_sum_of_ranks_scores.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_podium_members.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_event_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/city_event_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/entity_ranking_counts.sql", root), "utf8"),
      readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    ]);

  assert.match(schema, /PROJECTION_REGISTRY/);
  assert.match(schema, /dependencies/);
  assert.match(schema, /build:/);
  assert.match(schema, /validate:/);
  assert.match(schema, /durationMs/);
  assert.match(schema, /rowCounts/);
  assert.match(schema, /DEFAULT_PROJECTION_NAMES/);
  assert.match(schema, /name: "sum-of-ranks"/);
  assert.match(schema, /enabledByDefault: true/);
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
  assert.match(metricValues, /kinch_value/);
  assert.match(metricScores, /CREATE TABLE person_metric_counts AS/);
  assert.match(sumValues, /CREATE TABLE person_sum_of_ranks_event_values AS/);
  assert.match(sumValues, /result\.person_country_id/);
  assert.match(sumValues, /PARTITION BY result_type, event_id, country_id/);
  assert.match(sumValues, /PARTITION BY result_type, event_id, continent_id/);
  assert.match(sumScores, /CREATE TABLE person_sum_of_ranks_scores AS/);
  assert.match(sumScores, /RANK\(\) OVER/);
  assert.match(sumScores, /ROW_NUMBER\(\) OVER/);
  assert.match(sumScores, /COUNT\(\*\) \+ 1 AS fallback_rank/);
  assert.match(sumScores, /fallback_score AS SIGNED\)[\s\S]*person\.score_adjustment AS score/);
  assert.match(sumScores, /ENGINE = MEMORY/);
  assert.doesNotMatch(sumScores, /CROSS JOIN/);
  assert.doesNotMatch(sumScores, /coverage = required_coverage/);
  assert.match(podiums, /podium_position/);
  assert.match(podiums, /is_final_round = 1/);
  assert.match(competitionEvents, /fastest_single_result_id/);
  assert.match(competitionEvents, /winning_average_result_id/);
  assert.match(competitionEvents, /fastest_single_rank/);
  assert.match(competitionEvents, /podium_average_rank/);
  assert.match(competitionEvents, /CASE WHEN best > 0 THEN best END/);
  assert.match(competitions, /northernmost_rank/);
  assert.match(competitions, /southernmost_rank/);
  assert.match(competitions, /NOT \(latitude = 0 AND longitude = 0\)/);
  assert.match(cities, /fastest_average_result_id/);
  assert.match(cities, /fastest_average_rank/);
  assert.match(counts, /CREATE TABLE entity_ranking_counts AS/);
  assert.match(schema, /entity-ranking-counts/);
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
    "entity_ranking_counts.sql",
    "person_sum_of_ranks_event_values.sql",
    "person_sum_of_ranks_scores.sql",
  ];
  const sources = await Promise.all(files.map((file) =>
    readFile(new URL(`sql/ranking-projections/${file}`, root), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /_entries\b/);
    assert.doesNotMatch(source, /sub_rank/);
  }
});

test("exposes bounded resource APIs without projection name scans", async () => {
  const [shared, people, results, rankings, entities, search] = await Promise.all([
    readFile(new URL("lib/projection-api.ts", root), "utf8"),
    readFile(new URL("lib/semantic-person-rankings.ts", root), "utf8"),
    readFile(new URL("lib/semantic-result-rankings.ts", root), "utf8"),
    readFile(new URL("lib/rankings.ts", root), "utf8"),
    readFile(new URL("lib/semantic-entity-rankings.ts", root), "utf8"),
    readFile(new URL("lib/person-search.ts", root), "utf8"),
  ]);

  assert.match(shared, /MAX_PAGE_SIZE = 100/);
  assert.match(shared, /ApiInputError/);
  assert.match(people, /WITH page AS/);
  assert.match(people, /FROM person_event_rankings ranking/);
  assert.match(results, /FROM result_rankings ranking/);
  assert.match(results, /afterCompetitionId/);
  assert.match(rankings, /FROM person_sum_of_ranks_scores score/);
  assert.match(rankings, /input\.eventId === "SOR"/);
  assert.match(rankings, /score\.position AS sub_rank/);
  assert.match(entities, /FROM competition_event_stats stats/);
  assert.match(entities, /FROM city_event_stats stats/);
  assert.match(search, /FROM persons person/);

  for (const source of [people, results, rankings, entities]) {
    assert.doesNotMatch(source, /FROM results\b/);
    assert.doesNotMatch(source, /person_name LIKE/);
  }
});

test("only exposes APIs backed by active projections", async () => {
  const activeRoutes = [
    "app/api/people/search/route.ts",
    "app/api/rankings/route.ts",
  ];
  const inactiveRoutes = [
    "app/api/rankings/people/route.ts",
    "app/api/rankings/results/route.ts",
    "app/api/rankings/competitions/route.ts",
    "app/api/rankings/podiums/route.ts",
    "app/api/rankings/cities/route.ts",
    "app/api/rankings/metrics/route.ts",
  ];
  for (const route of activeRoutes) {
    await readFile(new URL(route, root), "utf8");
  }
  for (const route of inactiveRoutes) {
    await assert.rejects(readFile(new URL(route, root), "utf8"));
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
