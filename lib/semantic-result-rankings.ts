import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  optionalInteger,
  optionalText,
  parseEvent,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseScope,
} from "@/lib/projection-api";

type ResultRankingRow = {
  result_id: number;
  result_value: number;
  rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export async function loadResultRankings(params: URLSearchParams) {
  const order = params.get("order") ?? "ranking";
  if (order !== "ranking" && order !== "recent") {
    throw new ApiInputError("order must be ranking or recent.");
  }
  const eventId = parseEvent(params, { required: order === "ranking" });
  const resultType = parseResultType(params, eventId);
  const { scope, regionId } = parseScope(params);
  const personId = parsePersonId(params, { required: order === "recent" });
  const limit = parseLimit(params);
  const conditions = ["ranking.result_type = ?"];
  const values: unknown[] = [resultType];
  if (eventId) {
    conditions.push("ranking.event_id = ?");
    values.push(eventId);
  }
  if (scope !== "world") {
    if (order === "recent") throw new ApiInputError("region is not supported with recent ordering.");
    conditions.push(`ranking.${scope}_id = ?`);
    values.push(regionId);
  }
  if (personId) {
    conditions.push("ranking.person_id = ?");
    values.push(personId);
  }
  const countConditions = [...conditions];
  const countValues = [...values];

  let cursor = "";
  let ordering = "";
  if (order === "recent") {
    const afterDate = optionalText(params, "afterDate", 10);
    const afterResultId = optionalInteger(params, "afterResultId");
    if ((afterDate === null) !== (afterResultId === null)) {
      throw new ApiInputError("afterDate and afterResultId must be supplied together.");
    }
    if (afterDate) {
      cursor = " AND (ranking.competition_start_date < ? OR (ranking.competition_start_date = ? AND ranking.result_id < ?))";
      values.push(afterDate, afterDate, afterResultId);
    }
    ordering = "ranking.competition_start_date DESC, ranking.result_id DESC";
  } else {
    const cursorValues = {
      value: optionalInteger(params, "afterValue"),
      date: optionalText(params, "afterDate", 10),
      competitionId: optionalText(params, "afterCompetitionId"),
      personId: optionalText(params, "afterPersonId", 20),
      resultId: optionalInteger(params, "afterResultId"),
    };
    const supplied = Object.values(cursorValues).filter((value) => value !== null).length;
    if (supplied !== 0 && supplied !== 5) {
      throw new ApiInputError("All ranking cursor fields must be supplied together.");
    }
    if (supplied === 5) {
      cursor = ` AND (
        ranking.result_value > ?
        OR (ranking.result_value = ? AND ranking.competition_start_date > ?)
        OR (ranking.result_value = ? AND ranking.competition_start_date = ? AND ranking.competition_id > ?)
        OR (ranking.result_value = ? AND ranking.competition_start_date = ? AND ranking.competition_id = ? AND ranking.person_id > ?)
        OR (ranking.result_value = ? AND ranking.competition_start_date = ? AND ranking.competition_id = ? AND ranking.person_id = ? AND ranking.result_id > ?)
      )`;
      values.push(
        cursorValues.value,
        cursorValues.value, cursorValues.date,
        cursorValues.value, cursorValues.date, cursorValues.competitionId,
        cursorValues.value, cursorValues.date, cursorValues.competitionId, cursorValues.personId,
        cursorValues.value, cursorValues.date, cursorValues.competitionId, cursorValues.personId, cursorValues.resultId,
      );
    }
    ordering = "ranking.result_value, ranking.competition_start_date, ranking.competition_id, ranking.person_id, ranking.result_id";
  }

  const rows = await query<ResultRankingRow>(`
    WITH page AS (
      SELECT ranking.*, ranking.${scope}_rank AS rank
      FROM result_rankings ranking
      WHERE ${conditions.join(" AND ")}${cursor}
      ORDER BY ${ordering}
      LIMIT ?
    )
    SELECT page.result_id, page.result_value, page.rank, page.person_id,
      COALESCE(person.name, page.person_id) AS person_name,
      page.country_id, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2, page.continent_id,
      page.competition_id, COALESCE(competition.name, page.competition_id) AS competition_name,
      page.competition_start_date, page.round_type_id
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    ORDER BY ${order === "recent"
      ? "page.competition_start_date DESC, page.result_id DESC"
      : "page.result_value, page.competition_start_date, page.competition_id, page.person_id, page.result_id"}
  `, [...values, limit + 1]);

  let total = rows.rows.length;
  let countTimings = { queueMs: 0, statementMs: 0 };
  let countRows = 0;
  if (order === "ranking" && eventId && !personId) {
    const count = await query<{ count: number }>(
      `SELECT count FROM result_ranking_counts
       WHERE event_id = ? AND result_type = ? AND scope = ? AND region_id = ?`,
      [eventId, resultType, scope, regionId],
    );
    total = Number(count.rows[0]?.count ?? 0);
    countTimings = count.timings;
    countRows = count.rows.length;
  } else {
    const count = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM result_rankings ranking
       WHERE ${countConditions.join(" AND ")}`,
      countValues,
    );
    total = Number(count.rows[0]?.count ?? 0);
    countTimings = count.timings;
    countRows = count.rows.length;
  }

  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  let next = null;
  if (rows.rows.length > limit && last) {
    next = order === "recent"
      ? { afterDate: last.competition_start_date, afterResultId: Number(last.result_id) }
      : {
          afterValue: Number(last.result_value),
          afterDate: last.competition_start_date,
          afterCompetitionId: last.competition_id,
          afterPersonId: last.person_id,
          afterResultId: Number(last.result_id),
        };
  }
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        resultId: Number(row.result_id),
        value: Number(row.result_value),
        person: { id: row.person_id, name: row.person_name },
        country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
        continentId: row.continent_id,
        competition: {
          id: row.competition_id,
          name: row.competition_name,
          startDate: row.competition_start_date,
        },
        roundTypeId: row.round_type_id,
      })),
      context: { resource: "results", order, eventId, result: resultType, scope, regionId, personId: personId || null },
      page: { limit, hasMore: rows.rows.length > limit, next },
      total,
    },
    diagnostics: {
      timings: addTimings(rows.timings, countTimings),
      queryCount: 2,
      returnedRows: rows.rows.length + countRows,
    },
  };
}
