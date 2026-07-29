import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { getCurrentRankingsMetadata, getRankingCount, type RankingsMetadata } from "@/lib/rankings-metadata";
import { normalPageKey, rankingsPageCache } from "@/lib/rankings-cache";
import { searchPersonIds } from "@/lib/person-search";
import { getRecordBadges, isRankingEventId, isRankingType, isValidRegexPattern, parseRegionQuery, type RankingEntry, type RankingType, type RegionScope } from "@/lib/wca";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_SEARCH_RESULTS = 500;

type RankingRow = { rank: number; sub_rank: number; person_id: string; person_name: string; country_id: string; country_name: string; country_iso2: string; continent_id: string; best: number; competition_id: string; competition_name: string; is_world_record: number; is_continent_record: number; is_country_record: number };
type QueryInput = { eventId: string; type: RankingType; scope: RegionScope; regionId: string; startRank: number; cursorRank: number | null; cursorId: string; limit: number; locate: string; search: string; regexSearch: boolean; searchLimit: number; paged: boolean };
type SumOfRanksRow = {
  rank: number;
  sub_rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
};

function toRankingEntry(row: RankingRow): RankingEntry {
  return { rank: Number(row.rank), subRank: Number(row.sub_rank), personId: row.person_id, personName: row.person_name, countryId: row.country_id, countryName: row.country_name, countryIso2: row.country_iso2, continentId: row.continent_id, best: Number(row.best), competitionId: row.competition_id, competitionName: row.competition_name, recordBadges: getRecordBadges({ isWorldRecord: Number(row.is_world_record) === 1, isContinentRecord: Number(row.is_continent_record) === 1, isCountryRecord: Number(row.is_country_record) === 1, continentId: row.continent_id }) };
}

function shape(scope: RegionScope) {
  if (scope === "continent") return { rank: "continent_rank", subRank: "continent_sub_rank", region: "continent_id" } as const;
  if (scope === "country") return { rank: "country_rank", subRank: "country_sub_rank", region: "country_id" } as const;
  return { rank: "world_rank", subRank: "world_sub_rank", region: null } as const;
}

function table(type: RankingType) { return type === "average" ? "ranking_entries_average" : "ranking_entries_single"; }
function columns(rank: string, subRank: string) {
  return `${rank} AS rank, ${subRank} AS sub_rank, person_id, person_name, country_id, country_name, country_iso2, continent_id, best, competition_id, competition_name, is_world_record, is_continent_record, is_country_record`;
}
function filters(input: QueryInput) {
  const { rank, subRank, region } = shape(input.scope);
  const values: unknown[] = [input.eventId];
  const conditions = ["event_id = ?"];
  if (region) { conditions.push(`${region} = ?`); values.push(input.regionId); }
  conditions.push(`${rank} > 0`);
  return { rank, subRank, conditions, values };
}

function normalPageResponse(rows: RankingRow[], input: QueryInput, metadata: RankingsMetadata) {
  const total = getRankingCount(metadata, input.eventId, input.type, input.scope, input.regionId);
  const entries = rows.map(toRankingEntry);
  const startPosition = Math.min(Math.max(0, input.startRank - 1), total);
  const hasMore = input.startRank + entries.length <= total;
  return { entries, hasMore, nextPageStart: hasMore ? input.startRank + PAGE_SIZE : null, previousPageStart: input.startRank > 1 && total > 0 ? Math.max(1, input.startRank - PAGE_SIZE) : null, startPosition, lastRank: entries.at(-1)?.subRank ?? null, total, exportDate: metadata.exportDate };
}

async function queryNormalPage(input: QueryInput, metadata: RankingsMetadata) {
  const { rank, subRank, conditions, values } = filters(input);
  const pageValues = [...values, input.startRank, input.startRank + PAGE_SIZE];
  const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${table(input.type)} WHERE ${conditions.join(" AND ")} AND ${subRank} >= ? AND ${subRank} < ? ORDER BY ${subRank}`, pageValues, { rankingStatementTimeout: true });
  return { data: normalPageResponse(result.rows, input, metadata), timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
}

export async function queryMysql(input: QueryInput) {
  if (input.eventId === "SOR") return querySumOfRanks(input);
  const { rank, subRank, conditions, values } = filters(input);
  const source = table(input.type);
  if (input.locate) {
    const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")} AND person_id = ? LIMIT 1`, [...values, input.locate]);
    return { data: { located: result.rows[0] ? toRankingEntry(result.rows[0]) : null }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  }
  if (input.search) {
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    if (people.personIds.length === 0) {
      return { data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, total: 0 }, timings: people.timings, queryCount: 1, returnedRows: 0 };
    }
    const placeholders = people.personIds.map(() => "?").join(", ");
    const result = await query<RankingRow>(
      `SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")} AND person_id IN (${placeholders}) ORDER BY ${subRank} LIMIT ?`,
      [...values, ...people.personIds, input.searchLimit],
    );
    const entries = result.rows.map(toRankingEntry);
    return {
      data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length },
      timings: {
        queueMs: people.timings.queueMs + result.timings.queueMs,
        statementMs: people.timings.statementMs + result.timings.statementMs,
      },
      queryCount: 2,
      returnedRows: people.returnedRows + result.rows.length,
    };
  }
  const cursor = input.cursorRank
    ? ` AND (${subRank} > ? OR (${subRank} = ? AND person_id > ?))`
    : ` AND ${subRank} >= ?`;
  const pageValues = input.cursorRank ? [...values, input.cursorRank, input.cursorRank, input.cursorId, input.limit + 1] : [...values, input.startRank, input.limit + 1];
  const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")}${cursor} ORDER BY ${subRank} LIMIT ?`, pageValues);
  const entries = result.rows.slice(0, input.limit).map(toRankingEntry);
  return { data: { entries, hasMore: result.rows.length > input.limit, nextPageStart: null, previousPageStart: null, total: entries.length }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
}

function sumOfRanksEntry(row: SumOfRanksRow): RankingEntry {
  return {
    rank: Number(row.rank),
    subRank: Number(row.sub_rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

async function querySumOfRanks(input: QueryInput) {
  const values: unknown[] = [input.type, input.scope, input.regionId];
  const conditions = [
    "score.metric_version = 1",
    "score.event_set_version = 1",
    "score.result_type = ?",
    "score.scope = ?",
    "score.region_id = ?",
  ];
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;

  if (input.locate) {
    conditions.push("score.person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
    if (people.personIds.length === 0) {
      return {
        data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, total: 0 },
        timings: people.timings,
        queryCount: 1,
        returnedRows: people.returnedRows,
      };
    }
    conditions.push(`score.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    values.push(...people.personIds);
  } else if (input.cursorRank) {
    conditions.push("(score.position > ? OR (score.position = ? AND score.person_id > ?))");
    values.push(input.cursorRank, input.cursorRank, input.cursorId);
  } else {
    conditions.push("score.position >= ?");
    values.push(input.startRank);
  }

  const limit = input.locate ? 1 : input.search ? input.searchLimit : input.limit + 1;
  const result = await query<SumOfRanksRow>(
    `SELECT score.rank, score.position AS sub_rank, score.person_id,
       COALESCE(person.name, score.person_id) AS person_name,
       COALESCE(display_country.id, '') AS country_id,
       COALESCE(display_country.name, display_country.id, '') AS country_name,
       COALESCE(display_country.iso2, '') AS country_iso2,
       COALESCE(display_country.continent_id, '') AS continent_id,
       score.score AS best
     FROM person_sum_of_ranks_scores score
     LEFT JOIN persons person ON person.wca_id = score.person_id AND person.sub_id = 1
     LEFT JOIN countries current_country ON current_country.id = person.country_id
     LEFT JOIN countries display_country ON display_country.id = CASE
       WHEN ? = 'country' THEN ?
       WHEN ? = 'continent' AND current_country.continent_id <> ? THEN NULL
       ELSE person.country_id
     END
     WHERE ${conditions.join(" AND ")}
     ORDER BY score.position, score.person_id
     LIMIT ?`,
    [input.scope, input.regionId, input.scope, input.regionId, ...values, limit],
  );
  const timings = {
    queueMs: peopleTimings.queueMs + result.timings.queueMs,
    statementMs: peopleTimings.statementMs + result.timings.statementMs,
  };
  const entries = result.rows.slice(0, input.locate ? 1 : limit - (input.search ? 0 : 1)).map(sumOfRanksEntry);
  if (input.locate) {
    return {
      data: { located: entries[0] ?? null },
      timings,
      queryCount: 1 + (input.search ? 1 : 0),
      returnedRows: peopleReturnedRows + result.rows.length,
    };
  }
  if (input.search) {
    return {
      data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length },
      timings,
      queryCount: 2,
      returnedRows: peopleReturnedRows + result.rows.length,
    };
  }

  const end = await query<{ position: number }>(
    `SELECT position
     FROM person_sum_of_ranks_scores
     WHERE metric_version = 1 AND event_set_version = 1
       AND result_type = ? AND scope = ? AND region_id = ?
     ORDER BY position DESC
     LIMIT 1`,
    [input.type, input.scope, input.regionId],
  );
  return {
    data: {
      entries,
      hasMore: result.rows.length > input.limit,
      nextPageStart: result.rows.length > input.limit ? input.startRank + PAGE_SIZE : null,
      previousPageStart: input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null,
      startPosition: Math.max(0, input.startRank - 1),
      lastRank: entries.at(-1)?.subRank ?? null,
      total: Number(end.rows[0]?.position ?? 0),
      exportDate: null,
    },
    timings: {
      queueMs: timings.queueMs + end.timings.queueMs,
      statementMs: timings.statementMs + end.timings.statementMs,
    },
    queryCount: 2,
    returnedRows: result.rows.length + end.rows.length,
  };
}

function parseInput(searchParams: URLSearchParams): QueryInput {
  const eventId = isRankingEventId(searchParams.get("eventId") ?? searchParams.get("event")) ? searchParams.get("eventId") ?? searchParams.get("event")! : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  const type = eventId === "333mbf" ? "single" : isRankingType(rawType) ? rawType : "single";
  const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
  if (scope !== "world" && !regionId) throw new Error("Choose a region before loading rankings.");
  const paged = searchParams.get("paged") === "1";
  const rawStart = Number(searchParams.get("start"));
  const startRank = paged ? Math.floor(Math.max(0, Number.isFinite(rawStart) ? rawStart : 0) / PAGE_SIZE) * PAGE_SIZE + 1 : Math.max(1, rawStart || 1);
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = searchParams.get("mode") === "vim";
  if (regexSearch && search && !isValidRegexPattern(search)) throw new Error("Invalid regular expression.");
  return { eventId, type, scope, regionId, startRank, cursorRank: Number(searchParams.get("cursorRank")) || null, cursorId: searchParams.get("cursorId") ?? "", limit: paged ? PAGE_SIZE : Math.min(PAGE_SIZE, Math.max(20, Number(searchParams.get("limit")) || 80)), locate: (searchParams.get("locate") ?? "").trim().toUpperCase(), search, regexSearch, searchLimit: Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS)), paged };
}

export async function loadRankingsWithDiagnostics(searchParams: URLSearchParams) {
  const input = parseInput(searchParams);
  if (input.eventId === "SOR") {
    const result = await queryMysql(input);
    return { ...result, cacheOutcome: "bypass" as const, dataVersion: null };
  }
  const cacheable = input.paged && !input.search && !input.locate && !input.cursorRank && !input.cursorId;
  if (!cacheable) {
    const result = await queryMysql(input);
    return { ...result, cacheOutcome: "bypass" as const, dataVersion: null };
  }
  const metadata = await getCurrentRankingsMetadata();
  const cached = await rankingsPageCache.getWithStatus(normalPageKey({ eventId: input.eventId, type: input.type, scope: input.scope, regionId: input.regionId, startRank: input.startRank }), () => queryNormalPage(input, metadata)) as { value: Awaited<ReturnType<typeof queryNormalPage>>; outcome: "hit" | "miss" | "coalesced" };
  return {
    ...cached.value,
    timings: cached.outcome === "hit" ? { queueMs: 0, statementMs: 0 } : cached.value.timings,
    cacheOutcome: cached.outcome,
    dataVersion: metadata.fetchedAt,
  };
}

export async function loadRankings(searchParams: URLSearchParams) {
  return (await loadRankingsWithDiagnostics(searchParams)).data;
}
