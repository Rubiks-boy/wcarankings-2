import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { getCurrentRankingsMetadata, getRankingCount, type RankingsMetadata } from "@/lib/rankings-metadata";
import { normalPageKey, rankingsPageCache } from "@/lib/rankings-cache";
import { getRecordBadges, isEventId, isRankingType, isValidRegexPattern, parseRegionQuery, type RankingEntry, type RankingType, type RegionScope } from "@/lib/wca";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_SEARCH_RESULTS = 500;

type RankingRow = { rank: number; sub_rank: number; person_id: string; person_name: string; country_id: string; country_name: string; country_iso2: string; continent_id: string; best: number; competition_id: string; competition_name: string; is_world_record: number; is_continent_record: number; is_country_record: number };
type QueryInput = { eventId: string; type: RankingType; scope: RegionScope; regionId: string; startRank: number; cursorRank: number | null; cursorId: string; limit: number; locate: string; search: string; regexSearch: boolean; searchLimit: number; paged: boolean };

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
  const { rank, subRank, conditions, values } = filters(input);
  const source = table(input.type);
  if (input.locate) {
    const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")} AND person_id = ? LIMIT 1`, [...values, input.locate]);
    return { data: { located: result.rows[0] ? toRankingEntry(result.rows[0]) : null }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  }
  if (input.search) {
    if (input.regexSearch && !isValidRegexPattern(input.search)) throw new Error("Invalid regular expression.");
    const operator = input.regexSearch ? "REGEXP" : "LIKE";
    const pattern = input.regexSearch ? input.search : `%${input.search}%`;
    const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")} AND (person_name ${operator} ? OR person_id ${operator} ?) ORDER BY ${subRank} LIMIT ?`, [...values, pattern, pattern, input.searchLimit]);
    const entries = result.rows.map(toRankingEntry);
    return { data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  }
  const cursor = input.cursorRank
    ? ` AND (${subRank} > ? OR (${subRank} = ? AND person_id > ?))`
    : ` AND ${subRank} >= ?`;
  const pageValues = input.cursorRank ? [...values, input.cursorRank, input.cursorRank, input.cursorId, input.limit + 1] : [...values, input.startRank, input.limit + 1];
  const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${source} WHERE ${conditions.join(" AND ")}${cursor} ORDER BY ${subRank} LIMIT ?`, pageValues);
  const entries = result.rows.slice(0, input.limit).map(toRankingEntry);
  return { data: { entries, hasMore: result.rows.length > input.limit, nextPageStart: null, previousPageStart: null, total: entries.length }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
}

function parseInput(searchParams: URLSearchParams): QueryInput {
  const eventId = isEventId(searchParams.get("eventId") ?? searchParams.get("event")) ? searchParams.get("eventId") ?? searchParams.get("event")! : "333";
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
