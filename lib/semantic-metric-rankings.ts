import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseScope,
  parseStart,
} from "@/lib/projection-api";
import { WCA_EVENTS } from "@/lib/wca";

type MetricRow = {
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  rank: number;
  score: string;
  coverage: number;
  required_coverage: number;
  event_id: string;
  event_rank: number;
  personal_result: number;
  reference_result: number;
  metric_value: string | null;
};

export async function loadMetricRankings(params: URLSearchParams) {
  const metric = params.get("metric");
  if (metric !== "kinch" && metric !== "sum_of_ranks") {
    throw new ApiInputError("metric must be kinch or sum_of_ranks.");
  }
  const resultType = parseResultType(params);
  const { scope, regionId } = parseScope(params);
  const personId = parsePersonId(params);
  const start = parseStart(params);
  const limit = parseLimit(params);
  const conditions = [
    "score.metric = ?",
    "score.metric_version = 1",
    "score.event_set_version = 1",
    "score.result_type = ?",
    "score.scope = ?",
    "score.region_id = ?",
  ];
  const values: unknown[] = [metric, resultType, scope, regionId];
  if (personId) {
    conditions.push("score.person_id = ?");
    values.push(personId);
  } else {
    conditions.push("score.position >= ?");
    values.push(start);
  }

  const rows = await query<MetricRow>(`
    WITH page AS (
      SELECT score.*
      FROM person_metric_scores score
      WHERE ${conditions.join(" AND ")}
      ORDER BY score.position, score.person_id
      LIMIT ?
    )
    SELECT page.person_id, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      page.rank, page.score, page.coverage, page.required_coverage,
      value.event_id, value.event_rank, value.personal_result, value.reference_result,
      CASE WHEN page.metric = 'kinch' THEN value.kinch_value ELSE value.sum_of_ranks_value END AS metric_value
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = person.country_id
    INNER JOIN person_metric_values value
      ON value.metric_version = page.metric_version
      AND value.event_set_version = page.event_set_version
      AND value.result_type = page.result_type
      AND value.scope = page.scope
      AND value.region_id = page.region_id
      AND value.person_id = page.person_id
    ORDER BY page.position, page.person_id, value.event_id
  `, [...values, limit + 1]);
  const counts = await query<{ count: number }>(
    `SELECT count FROM person_metric_counts
     WHERE metric = ? AND metric_version = 1 AND event_set_version = 1
       AND result_type = ? AND scope = ? AND region_id = ?`,
    [metric, resultType, scope, regionId],
  );

  const byPerson = new Map<string, {
    rank: number;
    personId: string;
    personName: string;
    country: { id: string; name: string; iso2: string };
    score: number;
    coverage: number;
    requiredCoverage: number;
    events: Array<{
      eventId: string;
      rank: number;
      personalResult: number;
      referenceResult: number;
      value: number | null;
    }>;
  }>();
  for (const row of rows.rows) {
    let entry = byPerson.get(row.person_id);
    if (!entry) {
      entry = {
        rank: Number(row.rank),
        personId: row.person_id,
        personName: row.person_name,
        country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
        score: Number(row.score),
        coverage: Number(row.coverage),
        requiredCoverage: Number(row.required_coverage),
        events: [],
      };
      byPerson.set(row.person_id, entry);
    }
    entry.events.push({
      eventId: row.event_id,
      rank: Number(row.event_rank),
      personalResult: Number(row.personal_result),
      referenceResult: Number(row.reference_result),
      value: row.metric_value === null ? null : Number(row.metric_value),
    });
  }
  const eventOrder = new Map<string, number>(
    WCA_EVENTS.map((event, index) => [event.id, index]),
  );
  const entries = [...byPerson.values()].slice(0, limit);
  for (const entry of entries) {
    entry.events.sort((left, right) =>
      (eventOrder.get(left.eventId) ?? 999) - (eventOrder.get(right.eventId) ?? 999));
  }
  return {
    data: {
      entries,
      context: { resource: "metrics", metric, result: resultType, scope, regionId, personId: personId || null },
      page: {
        limit,
        hasMore: byPerson.size > limit,
        next: byPerson.size > limit && !personId ? { start: start + limit } : null,
      },
      total: personId ? entries.length : Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
