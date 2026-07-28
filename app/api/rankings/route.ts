import { query } from "@/db";
import { makeDemoRankings } from "@/lib/demo-data";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  isEventId,
  isRankingType,
  isValidRegexPattern,
  parseRegionQuery,
  type RankingEntry,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";

export const dynamic = "force-dynamic";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_SEARCH_RESULTS = 500;
const CACHE_HEADERS = { "Cache-Control": "public, max-age=60, s-maxage=3600" };

type RankingRow = {
  rank: number;
  sub_rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
  competition_id: string;
  competition_name: string;
};

function toRankingEntry(row: RankingRow): RankingEntry {
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
    competitionId: row.competition_id,
    competitionName: row.competition_name,
  };
}

function getQueryShape(scope: RegionScope) {
  if (scope === "continent") {
    return { rankColumn: "continent_rank", subRankColumn: "continent_sub_rank", regionColumn: "continent_id" } as const;
  }
  if (scope === "country") {
    return { rankColumn: "country_rank", subRankColumn: "country_sub_rank", regionColumn: "country_id" } as const;
  }
  return { rankColumn: "world_rank", subRankColumn: "world_sub_rank", regionColumn: null } as const;
}

function addParameter(values: unknown[], value: unknown) {
  values.push(value);
  return "?";
}

async function hasStoredSubRank(column: string) {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'ranking_entries'
      AND column_name = ?`,
    [column],
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

function getSubRankPartition(scope: RegionScope) {
  if (scope === "continent") return "event_id, ranking_type, continent_id";
  if (scope === "country") return "event_id, ranking_type, country_id";
  return "event_id, ranking_type";
}

function getRankingSource(
  scope: RegionScope,
  rankColumn: string,
  subRankColumn: string,
  storedSubRank: boolean,
) {
  if (storedSubRank) return "ranking_entries";
  const partition = getSubRankPartition(scope);
  return `(SELECT ranking_entries.*,
      ROW_NUMBER() OVER (
        PARTITION BY ${partition}
        ORDER BY ${rankColumn}, person_name, person_id
      ) AS ${subRankColumn}
    FROM ranking_entries) AS ranking_entries`;
}

function makeFilters({
  eventId,
  type,
  scope,
  regionId,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
}) {
  const { rankColumn, subRankColumn, regionColumn } = getQueryShape(scope);
  const values: unknown[] = [];
  const conditions = [
    `event_id = ${addParameter(values, eventId)}`,
    `ranking_type = ${addParameter(values, type)}`,
  ];
  if (regionColumn) {
    conditions.push(`${regionColumn} = ${addParameter(values, regionId)}`);
  }
  return { rankColumn, subRankColumn, conditions, values };
}

export async function queryMysql({
  eventId,
  type,
  scope,
  regionId,
  startRank,
  cursorRank,
  cursorId,
  limit,
  locate,
  search,
  regexSearch = false,
  searchLimit,
  paged,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
  cursorRank: number | null;
  cursorId: string;
  limit: number;
  locate: string;
  search: string;
  regexSearch?: boolean;
  searchLimit: number;
  paged: boolean;
}) {
  const filter = makeFilters({ eventId, type, scope, regionId });
  const { rankColumn, subRankColumn: storedSubRankColumn, conditions } = filter;
  const storedSubRank = await hasStoredSubRank(storedSubRankColumn);
  const subRankColumn = storedSubRank ? storedSubRankColumn : "sub_rank";
  const rankingSource = getRankingSource(
    scope,
    rankColumn,
    subRankColumn,
    storedSubRank,
  );

  if (locate) {
    const values = [...filter.values];
    const locateParameter = addParameter(values, locate);
    const located = await query<RankingRow>(
      `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name
      FROM ${rankingSource}
      WHERE ${conditions.join(" AND ")} AND person_id = ${locateParameter}
      LIMIT 1`,
      values,
    );

    return { located: located.rows[0] ? toRankingEntry(located.rows[0]) : null, source: "wca" as const };
  }

  if (search) {
    if (regexSearch && !isValidRegexPattern(search)) {
      throw new Error("Invalid regular expression.");
    }
    const values = [...filter.values];
    const searchPattern = regexSearch ? search : `%${search}%`;
    const searchNameParameter = addParameter(values, searchPattern);
    const searchIdParameter = addParameter(values, searchPattern);
    const searchOperator = regexSearch ? "REGEXP" : "LIKE";
    const searchResult = await query<RankingRow>(
      `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name
      FROM ${rankingSource}
      WHERE ${conditions.join(" AND ")}
        AND (person_name ${searchOperator} ${searchNameParameter} OR person_id ${searchOperator} ${searchIdParameter})
      ORDER BY ${subRankColumn}
      LIMIT ${addParameter(values, searchLimit)}`,
      values,
    );

    return {
      entries: searchResult.rows.map(toRankingEntry),
      hasMore: false,
      nextPageStart: null,
      previousPageStart: null,
      nextCursor: null,
      total: searchResult.rowCount ?? searchResult.rows.length,
      exportDate: null,
      source: "wca" as const,
    };
  }

  // The public row rank stays in `rank`; all paging coordinates use sub_rank.
  const pageStartRank = paged
    ? Math.floor((Math.max(1, startRank) - 1) / limit) * limit + 1
    : startRank;

  const values = [...filter.values];
  const pageConditions = [...conditions];
  const cursorClause = paged
    ? ` AND ${subRankColumn} >= ${addParameter(values, pageStartRank)} AND ${subRankColumn} < ${addParameter(values, pageStartRank + limit)}`
    : cursorRank
      ? ` AND (${subRankColumn} > ${addParameter(values, cursorRank)} OR (${subRankColumn} = ${addParameter(values, cursorRank)} AND person_id > ${addParameter(values, cursorId)}))`
      : ` AND ${subRankColumn} >= ${addParameter(values, startRank)}`;
  pageConditions.push(cursorClause.slice(5));
  const limitParameter = paged ? "" : ` LIMIT ${addParameter(values, limit + 1)}`;
  const querySql = `SELECT ${rankColumn} AS rank, ${subRankColumn} AS sub_rank, person_id, person_name, country_id, country_name,
      country_iso2, continent_id, best, competition_id, competition_name
    FROM ${rankingSource}
    WHERE ${pageConditions.join(" AND ")}
    ORDER BY ${subRankColumn}${limitParameter}`;

  const nextPageRank = paged
    ? query<{ rank: number | null }>(
      `SELECT MIN(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} >= ?`,
      [...filter.values, pageStartRank + limit],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);
  const previousPageRank = paged && pageStartRank > 1
    ? query<{ rank: number | null }>(
      `SELECT MAX(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} < ?`,
      [...filter.values, pageStartRank],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);

  const countValues = [eventId, type, scope, regionId];
  const [result, countResult, exportDateResult, fetchedAtResult, nextRankRow, previousRankRow, startPositionRow, lastRankRow] = await Promise.all([
    query<RankingRow>(querySql, values),
    query<{ count: number }>(
      "SELECT count FROM ranking_counts WHERE event_id = ? AND ranking_type = ? AND scope = ? AND region_id = ?",
      countValues,
    ),
    query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'export_date'"),
    query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'fetched_at'"),
    nextPageRank,
    previousPageRank,
    paged
      ? query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${rankingSource} WHERE ${conditions.join(" AND ")} AND ${subRankColumn} < ?`,
        [...filter.values, pageStartRank],
      ).then((result) => result.rows[0] ?? null)
      : Promise.resolve({ count: 0 }),
    query<{ rank: number | null }>(
      `SELECT MAX(${subRankColumn}) AS rank FROM ${rankingSource} WHERE ${conditions.join(" AND ")}`,
      filter.values,
    ).then((result) => result.rows[0] ?? null),
  ]);

  const rows = result.rows.map(toRankingEntry);
  const countRow = countResult.rows[0];
  const exportDateRow = exportDateResult.rows[0];
  const fetchedAtRow = fetchedAtResult.rows[0];
  const total = Number(countRow?.count ?? 0);
  const nextPageStart = nextRankRow?.rank
    ? Number(nextRankRow.rank)
    : null;
  const previousPageStart = previousRankRow?.rank
    ? Math.max(1, pageStartRank - limit)
    : null;
  const hasMore = paged ? nextPageStart !== null : rows.length > limit;
  const entries = paged ? rows : (hasMore ? rows.slice(0, limit) : rows);
  const last = entries.at(-1);

  return {
    entries,
    hasMore,
    nextPageStart,
    previousPageStart,
    startPosition: Number(startPositionRow?.count ?? 0),
    lastRank: Number(lastRankRow?.rank ?? 0) || null,
    nextCursor: last ? { rank: last.subRank, personId: last.personId } : null,
    total,
    exportDate: exportDateRow?.value ?? null,
    fetchedAt: fetchedAtRow?.value ?? exportDateRow?.value ?? null,
    source: "wca" as const,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawEventId = url.searchParams.get("eventId") ?? url.searchParams.get("event");
  const rawType = url.searchParams.get("result") ?? url.searchParams.get("type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const type = eventId === "333mbf" ? "single" : isRankingType(rawType) ? rawType : "single";
  const { scope, regionId } = parseRegionQuery(url.searchParams.get("region"));
  const paged = url.searchParams.get("paged") === "1";
  const requestedLimit = Number(url.searchParams.get("limit")) || (paged ? PAGE_SIZE : 80);
  const limit = paged
    ? PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(20, requestedLimit));
  const rawStart = Number(url.searchParams.get("start"));
  const requestedStart = Number.isFinite(rawStart) ? rawStart : 0;
  const startRank = paged
    ? Math.floor(Math.max(0, requestedStart) / PAGE_SIZE) * PAGE_SIZE + 1
    : Math.max(1, requestedStart || 1);
  const cursorRank = Number(url.searchParams.get("cursorRank")) || null;
  const cursorId = url.searchParams.get("cursorId") ?? "";
  const locate = (url.searchParams.get("locate") ?? "").trim().toUpperCase();
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = url.searchParams.get("mode") === "vim";
  const requestedSearchLimit = Number(url.searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS;
  const searchLimit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, requestedSearchLimit));

  if (scope !== "world" && !regionId) {
    return Response.json({ error: "Choose a region before loading rankings." }, { status: 400 });
  }

  if (regexSearch && search && !isValidRegexPattern(search)) {
    return Response.json({ error: "Invalid regular expression." }, { status: 400 });
  }

  try {
    const data = await queryMysql({
      eventId,
      type,
      scope,
      regionId,
      startRank,
      cursorRank,
      cursorId,
      limit,
      locate,
      search,
      regexSearch,
      searchLimit,
      paged,
    });
    return Response.json(data, { headers: CACHE_HEADERS });
  } catch {
    const demoStartRank = paged ? startRank : (cursorRank ? cursorRank + 1 : startRank);
    const entries = makeDemoRankings({ eventId, type, scope, regionId, startRank: demoStartRank, limit });
    const located = locate
      ? entries.find((entry) => entry.personId === locate) ??
        makeDemoRankings({ eventId, type, scope, regionId, startRank: 1, limit: 40 }).find(
          (entry) => entry.personId === locate,
        ) ??
        null
      : undefined;

    if (locate) {
      return Response.json({ located, source: "demo" }, { headers: CACHE_HEADERS });
    }

    if (search) {
      const normalizedSearch = search.toLocaleLowerCase();
      const searchEntries = makeDemoRankings({ eventId, type, scope, regionId, startRank: 1, limit: searchLimit })
        .filter((entry) => entry.personName.toLocaleLowerCase().includes(normalizedSearch) || entry.personId.toLocaleLowerCase().includes(normalizedSearch));
      return Response.json(
        { entries: searchEntries, total: searchEntries.length, source: "demo" },
        { headers: CACHE_HEADERS },
      );
    }

    const last = entries.at(-1);
    const hasMore = startRank + limit <= 248_392;
    return Response.json(
      {
        entries,
        hasMore,
        nextPageStart: hasMore ? startRank + limit : null,
        previousPageStart: startRank > 1 ? Math.max(1, startRank - limit) : null,
        startPosition: Math.max(0, startRank - 1),
        lastRank: 248_392,
        nextCursor: last ? { rank: last.rank, personId: last.personId } : null,
        total: 248_392,
        exportDate: null,
        source: "demo",
      },
      { headers: CACHE_HEADERS },
    );
  }
}
