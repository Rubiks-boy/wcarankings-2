import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  optionalInteger,
  optionalText,
  parseEvent,
  parseLimit,
  parseResultType,
} from "@/lib/projection-api";

type CompetitionRow = {
  rank: number;
  competition_id: string;
  competition_name: string;
  start_date: string;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  latitude: number | null;
  longitude: number | null;
  competitor_count: number;
  result_id: number | null;
  result_value: number | null;
  person_id: string | null;
  person_name: string | null;
  round_type_id: string | null;
};

async function entityCount(kind: string, eventId = "", resultType = "") {
  return query<{ count: number }>(
    `SELECT count FROM entity_ranking_counts
     WHERE ranking_kind = ? AND event_id = ? AND result_type = ?`,
    [kind, eventId, resultType],
  );
}

function competitionMetadata(row: CompetitionRow) {
  return {
    id: row.competition_id,
    name: row.competition_name,
    startDate: row.start_date,
    cityName: row.city_name,
    country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
    coordinates: row.latitude === null || row.longitude === null
      ? null
      : { latitudeMicrodegrees: Number(row.latitude), longitudeMicrodegrees: Number(row.longitude) },
  };
}

export async function loadCompetitionRankings(params: URLSearchParams) {
  const ranking = params.get("ranking") ?? "fastest";
  if (!["fastest", "largest", "northernmost", "southernmost"].includes(ranking)) {
    throw new ApiInputError("ranking must be fastest, largest, northernmost, or southernmost.");
  }
  const limit = parseLimit(params);
  if (ranking === "fastest") return loadFastestCompetitions(params, limit);
  if (params.has("eventId") || params.has("event") || params.has("result") || params.has("type")) {
    throw new ApiInputError(`${ranking} rankings do not accept event or result parameters.`);
  }

  const afterCompetitionId = optionalText(params, "afterCompetitionId");
  let cursor = "";
  const values: unknown[] = [];
  let orderSql: string;
  let rankColumn: string;
  if (ranking === "largest") {
    const afterCount = optionalInteger(params, "afterCount");
    if ((afterCount === null) !== (afterCompetitionId === null)) {
      throw new ApiInputError("afterCount and afterCompetitionId must be supplied together.");
    }
    if (afterCount !== null) {
      cursor = "WHERE stats.competitor_count < ? OR (stats.competitor_count = ? AND stats.competition_id > ?)";
      values.push(afterCount, afterCount, afterCompetitionId);
    }
    orderSql = "stats.competitor_count DESC, stats.competition_id";
    rankColumn = "largest_rank";
  } else {
    const afterLatitude = optionalInteger(params, "afterLatitude");
    const afterDate = optionalText(params, "afterDate", 10);
    const supplied = [afterLatitude, afterDate, afterCompetitionId].filter((value) => value !== null).length;
    if (supplied !== 0 && supplied !== 3) {
      throw new ApiInputError("All latitude cursor fields must be supplied together.");
    }
    const descending = ranking === "northernmost";
    if (supplied === 3) {
      const comparison = descending ? "<" : ">";
      cursor = `WHERE stats.${ranking}_rank IS NOT NULL AND (
        stats.latitude ${comparison} ?
        OR (stats.latitude = ? AND stats.start_date > ?)
        OR (stats.latitude = ? AND stats.start_date = ? AND stats.competition_id > ?)
      )`;
      values.push(afterLatitude, afterLatitude, afterDate, afterLatitude, afterDate, afterCompetitionId);
    } else {
      cursor = `WHERE stats.${ranking}_rank IS NOT NULL`;
    }
    orderSql = `stats.latitude ${descending ? "DESC" : "ASC"}, stats.start_date, stats.competition_id`;
    rankColumn = `${ranking}_rank`;
  }

  const rows = await query<CompetitionRow>(`
    WITH page AS (
      SELECT stats.*, stats.${rankColumn} AS rank
      FROM competition_stats stats
      ${cursor}
      ORDER BY ${orderSql}
      LIMIT ?
    )
    SELECT page.rank, page.competition_id,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      page.start_date, COALESCE(competition.city_name, '') AS city_name,
      COALESCE(competition.country_id, '') AS country_id,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      page.latitude, page.longitude, page.competitor_count,
      NULL AS result_id, NULL AS result_value, NULL AS person_id,
      NULL AS person_name, NULL AS round_type_id
    FROM page
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY ${orderSql.replaceAll("stats.", "page.")}
  `, [...values, limit + 1]);
  const counts = await entityCount(
    ranking === "largest" ? "competition_largest" : "competition_latitude",
  );
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  let next = null;
  if (rows.rows.length > limit && last) {
    next = ranking === "largest"
      ? { afterCount: Number(last.competitor_count), afterCompetitionId: last.competition_id }
      : {
          afterLatitude: Number(last.latitude),
          afterDate: last.start_date,
          afterCompetitionId: last.competition_id,
        };
  }
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        competition: competitionMetadata(row),
        competitorCount: Number(row.competitor_count),
      })),
      context: { resource: "competitions", ranking },
      page: { limit, hasMore: rows.rows.length > limit, next },
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

async function loadFastestCompetitions(params: URLSearchParams, limit: number) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const rankColumn = `${valueColumn}_rank`;
  const afterValue = optionalInteger(params, "afterValue");
  const afterDate = optionalText(params, "afterDate", 10);
  const afterCompetitionId = optionalText(params, "afterCompetitionId");
  const supplied = [afterValue, afterDate, afterCompetitionId].filter((value) => value !== null).length;
  if (supplied !== 0 && supplied !== 3) {
    throw new ApiInputError("All fastest cursor fields must be supplied together.");
  }
  const values: unknown[] = [eventId];
  let cursor = "";
  if (supplied === 3) {
    cursor = ` AND (
      stats.${valueColumn} > ?
      OR (stats.${valueColumn} = ? AND stats.start_date > ?)
      OR (stats.${valueColumn} = ? AND stats.start_date = ? AND stats.competition_id > ?)
    )`;
    values.push(afterValue, afterValue, afterDate, afterValue, afterDate, afterCompetitionId);
  }
  const rows = await query<CompetitionRow>(`
    WITH page AS (
      SELECT stats.competition_id, stats.start_date,
        stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        stats.${rankColumn} AS rank, stats.competitor_count
      FROM competition_event_stats stats
      WHERE stats.event_id = ? AND stats.${valueColumn} IS NOT NULL${cursor}
      ORDER BY stats.${valueColumn}, stats.start_date, stats.competition_id
      LIMIT ?
    )
    SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.city_name, '') AS city_name,
      COALESCE(competition.country_id, '') AS country_id,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      competition.latitude_microdegrees AS latitude,
      competition.longitude_microdegrees AS longitude,
      facts.person_id, COALESCE(person.name, facts.person_id) AS person_name,
      facts.round_type_id
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.result_value, page.start_date, page.competition_id
  `, [...values, limit + 1]);
  const counts = await entityCount("competition_fastest", eventId, resultType);
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        competition: competitionMetadata(row),
        competitorCount: Number(row.competitor_count),
        result: {
          id: Number(row.result_id),
          value: Number(row.result_value),
          person: { id: row.person_id, name: row.person_name },
          roundTypeId: row.round_type_id,
        },
      })),
      context: { resource: "competitions", ranking: "fastest", eventId, result: resultType },
      page: {
        limit,
        hasMore: rows.rows.length > limit,
        next: rows.rows.length > limit && last
          ? {
              afterValue: Number(last.result_value),
              afterDate: last.start_date,
              afterCompetitionId: last.competition_id,
            }
          : null,
      },
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

type PodiumRow = CompetitionRow & {
  score: number;
  podium_position: number;
  member_person_id: string;
  member_person_name: string;
  member_result_id: number;
  member_result_value: number;
};

export async function loadPodiumRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  if (eventId === "333mbf") throw new ApiInputError("Multi-Blind podium rankings are not supported.");
  const limit = parseLimit(params);
  const scoreColumn = `podium_${resultType}_score`;
  const rankColumn = `podium_${resultType}_rank`;
  const afterScore = optionalInteger(params, "afterScore");
  const afterDate = optionalText(params, "afterDate", 10);
  const afterCompetitionId = optionalText(params, "afterCompetitionId");
  const supplied = [afterScore, afterDate, afterCompetitionId].filter((value) => value !== null).length;
  if (supplied !== 0 && supplied !== 3) throw new ApiInputError("All podium cursor fields must be supplied together.");
  const values: unknown[] = [eventId];
  let cursor = "";
  if (supplied === 3) {
    cursor = ` AND (
      stats.${scoreColumn} > ?
      OR (stats.${scoreColumn} = ? AND stats.start_date > ?)
      OR (stats.${scoreColumn} = ? AND stats.start_date = ? AND stats.competition_id > ?)
    )`;
    values.push(afterScore, afterScore, afterDate, afterScore, afterDate, afterCompetitionId);
  }
  const rows = await query<PodiumRow>(`
    WITH page AS (
      SELECT stats.competition_id, stats.start_date,
        stats.${scoreColumn} AS score, stats.${rankColumn} AS rank
      FROM competition_event_stats stats
      WHERE stats.event_id = ? AND stats.${scoreColumn} IS NOT NULL${cursor}
      ORDER BY stats.${scoreColumn}, stats.start_date, stats.competition_id
      LIMIT ?
    )
    SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.city_name, '') AS city_name,
      COALESCE(competition.country_id, '') AS country_id,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      competition.latitude_microdegrees AS latitude,
      competition.longitude_microdegrees AS longitude,
      0 AS competitor_count, NULL AS result_id, NULL AS result_value,
      NULL AS person_id, NULL AS person_name, NULL AS round_type_id,
      member.podium_position, member.person_id AS member_person_id,
      COALESCE(person.name, member.person_id) AS member_person_name,
      member.result_id AS member_result_id, member.result_value AS member_result_value
    FROM page
    INNER JOIN competition_podium_members member
      ON member.competition_id = page.competition_id
      AND member.event_id = ?
      AND member.result_type = ?
    LEFT JOIN persons person ON person.wca_id = member.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.score, page.start_date, page.competition_id, member.podium_position
  `, [...values, limit + 1, eventId, resultType]);
  const counts = await entityCount("podium", eventId, resultType);
  const byCompetition = new Map<string, {
    rank: number;
    score: number;
    competition: ReturnType<typeof competitionMetadata>;
    members: Array<{ position: number; person: { id: string; name: string }; resultId: number; value: number }>;
  }>();
  for (const row of rows.rows) {
    let entry = byCompetition.get(row.competition_id);
    if (!entry) {
      entry = {
        rank: Number(row.rank),
        score: Number(row.score),
        competition: competitionMetadata(row),
        members: [],
      };
      byCompetition.set(row.competition_id, entry);
    }
    entry.members.push({
      position: Number(row.podium_position),
      person: { id: row.member_person_id, name: row.member_person_name },
      resultId: Number(row.member_result_id),
      value: Number(row.member_result_value),
    });
  }
  const entries = [...byCompetition.values()].slice(0, limit);
  const last = entries.at(-1);
  return {
    data: {
      entries,
      context: { resource: "podiums", eventId, result: resultType },
      page: {
        limit,
        hasMore: byCompetition.size > limit,
        next: byCompetition.size > limit && last
          ? {
              afterScore: last.score,
              afterDate: last.competition.startDate,
              afterCompetitionId: last.competition.id,
            }
          : null,
      },
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

type CityRow = {
  rank: number;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  result_id: number;
  result_value: number;
  person_id: string;
  person_name: string;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export async function loadCityRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  const limit = parseLimit(params);
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const rankColumn = `${valueColumn}_rank`;
  const afterValue = optionalInteger(params, "afterValue");
  const afterCountryId = optionalText(params, "afterCountryId");
  const afterCity = optionalText(params, "afterCity");
  const supplied = [afterValue, afterCountryId, afterCity].filter((value) => value !== null).length;
  if (supplied !== 0 && supplied !== 3) throw new ApiInputError("All city cursor fields must be supplied together.");
  const values: unknown[] = [eventId];
  let cursor = "";
  if (supplied === 3) {
    cursor = ` AND (
      stats.${valueColumn} > ?
      OR (stats.${valueColumn} = ? AND stats.country_id > ?)
      OR (stats.${valueColumn} = ? AND stats.country_id = ? AND stats.city_name > ?)
    )`;
    values.push(afterValue, afterValue, afterCountryId, afterValue, afterCountryId, afterCity);
  }
  const rows = await query<CityRow>(`
    WITH page AS (
      SELECT stats.city_name, stats.country_id,
        stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        stats.${rankColumn} AS rank
      FROM city_event_stats stats
      WHERE stats.event_id = ? AND stats.${valueColumn} IS NOT NULL${cursor}
      ORDER BY stats.${valueColumn}, stats.country_id, stats.city_name
      LIMIT ?
    )
    SELECT page.*, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      facts.person_id, COALESCE(person.name, facts.person_id) AS person_name,
      facts.competition_id, COALESCE(competition.name, facts.competition_id) AS competition_name,
      facts.competition_start_date, facts.round_type_id
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    LEFT JOIN countries country ON country.id = page.country_id
    ORDER BY page.result_value, page.country_id, page.city_name
  `, [...values, limit + 1]);
  const counts = await entityCount("city", eventId, resultType);
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        city: {
          name: row.city_name,
          country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
        },
        result: {
          id: Number(row.result_id),
          value: Number(row.result_value),
          person: { id: row.person_id, name: row.person_name },
          competition: {
            id: row.competition_id,
            name: row.competition_name,
            startDate: row.competition_start_date,
          },
          roundTypeId: row.round_type_id,
        },
      })),
      context: { resource: "cities", eventId, result: resultType },
      page: {
        limit,
        hasMore: rows.rows.length > limit,
        next: rows.rows.length > limit && last
          ? {
              afterValue: Number(last.result_value),
              afterCountryId: last.country_id,
              afterCity: last.city_name,
            }
          : null,
      },
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
