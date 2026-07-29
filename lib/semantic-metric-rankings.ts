import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseScope,
  parseStart,
  type QueryTimings,
} from "@/lib/projection-api";
import { WCA_EVENTS } from "@/lib/wca";

const SINGLE_EVENT_IDS = [
  "333", "222", "444", "555", "666", "777", "333bf", "333fm", "333oh",
  "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf",
] as const;
const AVERAGE_EVENT_IDS = SINGLE_EVENT_IDS.filter((eventId) => eventId !== "333mbf");

type MetricRow = {
  position: number;
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
};

type ScoreLocation = {
  position: number;
  coverage: number;
  required_coverage: number;
};

export async function loadMetricRankings(params: URLSearchParams) {
  const metric = params.get("metric");
  if (metric !== "sum_of_ranks") {
    throw new ApiInputError("metric must be sum_of_ranks.");
  }
  const resultType = parseResultType(params);
  const { scope, regionId } = parseScope(params);
  const personId = parsePersonId(params);
  const requestedStart = parseStart(params);
  const limit = parseLimit(params);
  const eventIds = resultType === "single" ? [...SINGLE_EVENT_IDS] : AVERAGE_EVENT_IDS;
  const timings: QueryTimings[] = [];
  let returnedRows = 0;
  let start = requestedStart;
  let selection: {
    personId: string;
    eligible: boolean;
    coverage: number;
    requiredCoverage: number;
    reason: "incomplete_coverage" | null;
  } | null = null;

  if (personId) {
    const located = await query<ScoreLocation>(
      `SELECT position, coverage, required_coverage
       FROM person_sum_of_ranks_scores
       WHERE metric_version = 1 AND event_set_version = 1
         AND result_type = ? AND scope = ? AND region_id = ? AND person_id = ?
       LIMIT 1`,
      [resultType, scope, regionId, personId],
    );
    timings.push(located.timings);
    returnedRows += located.rows.length;
    const location = located.rows[0];
    if (location) {
      start = Math.floor((Number(location.position) - 1) / limit) * limit + 1;
      selection = {
        personId,
        eligible: true,
        coverage: Number(location.coverage),
        requiredCoverage: Number(location.required_coverage),
        reason: null,
      };
    } else {
      const coverage = await query<{ coverage: number }>(
        `SELECT COUNT(*) AS coverage
         FROM person_sum_of_ranks_event_values
         WHERE metric_version = 1 AND event_set_version = 1
           AND result_type = ? AND scope = ? AND region_id = ? AND person_id = ?`,
        [resultType, scope, regionId, personId],
      );
      timings.push(coverage.timings);
      returnedRows += coverage.rows.length;
      selection = {
        personId,
        eligible: false,
        coverage: Number(coverage.rows[0]?.coverage ?? 0),
        requiredCoverage: eventIds.length,
        reason: "incomplete_coverage",
      };
    }
  }

  const counts = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM person_sum_of_ranks_scores
     WHERE metric_version = 1 AND event_set_version = 1
       AND result_type = ? AND scope = ? AND region_id = ?`,
    [resultType, scope, regionId],
  );
  timings.push(counts.timings);
  returnedRows += counts.rows.length;
  const total = Number(counts.rows[0]?.count ?? 0);

  if (selection && !selection.eligible) {
    return {
      data: {
        entries: [],
        context: {
          resource: "metrics",
          metric,
          metricVersion: 1,
          eventSetVersion: 1,
          eventIds,
          direction: "ascending",
          result: resultType,
          scope,
          regionId,
        },
        selection,
        page: { start: 1, limit, hasMore: false, next: null, previous: null },
        total,
      },
      diagnostics: {
        timings: addTimings(...timings),
        queryCount: timings.length,
        returnedRows,
      },
    };
  }

  const rows = await query<MetricRow>(
    `WITH page AS (
       SELECT position, person_id, rank, score, coverage, required_coverage
       FROM person_sum_of_ranks_scores
       WHERE metric_version = 1 AND event_set_version = 1
         AND result_type = ? AND scope = ? AND region_id = ?
         AND position >= ?
       ORDER BY position, person_id
       LIMIT ?
     )
     SELECT page.position, page.person_id,
       COALESCE(person.name, page.person_id) AS person_name,
       COALESCE(person.country_id, '') AS country_id,
       COALESCE(country.name, person.country_id, '') AS country_name,
       COALESCE(country.iso2, '') AS country_iso2,
       page.rank, page.score, page.coverage, page.required_coverage,
       value.event_id, value.event_rank
     FROM page
     LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
     LEFT JOIN countries country ON country.id = person.country_id
     INNER JOIN person_sum_of_ranks_event_values value
       ON value.metric_version = 1
       AND value.event_set_version = 1
       AND value.result_type = ?
       AND value.scope = ?
       AND value.region_id = ?
       AND value.person_id = page.person_id
     ORDER BY page.position, page.person_id, value.event_id`,
    [resultType, scope, regionId, start, limit + 1, resultType, scope, regionId],
  );
  timings.push(rows.timings);
  returnedRows += rows.rows.length;

  const byPerson = new Map<string, {
    position: number;
    rank: number;
    personId: string;
    personName: string;
    country: { id: string; name: string; iso2: string };
    score: number;
    coverage: number;
    requiredCoverage: number;
    events: Array<{ eventId: string; rank: number }>;
  }>();
  for (const row of rows.rows) {
    let entry = byPerson.get(row.person_id);
    if (!entry) {
      entry = {
        position: Number(row.position),
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
    entry.events.push({ eventId: row.event_id, rank: Number(row.event_rank) });
  }
  const eventOrder = new Map<string, number>(
    WCA_EVENTS.map((event, index) => [event.id, index]),
  );
  const pagePeople = [...byPerson.values()];
  const hasMore = pagePeople.length > limit;
  const entries = pagePeople.slice(0, limit).map(({ position: _position, ...entry }) => {
    entry.events.sort((left, right) =>
      (eventOrder.get(left.eventId) ?? 999) - (eventOrder.get(right.eventId) ?? 999));
    return entry;
  });

  return {
    data: {
      entries,
      context: {
        resource: "metrics",
        metric,
        metricVersion: 1,
        eventSetVersion: 1,
        eventIds,
        direction: "ascending",
        result: resultType,
        scope,
        regionId,
      },
      selection,
      page: {
        start,
        limit,
        hasMore,
        next: hasMore ? { start: start + limit } : null,
        previous: start > 1 ? { start: Math.max(1, start - limit) } : null,
      },
      total,
    },
    diagnostics: {
      timings: addTimings(...timings),
      queryCount: timings.length,
      returnedRows,
    },
  };
}
