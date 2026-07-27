import { query } from "@/db";
import { makeDemoRankings } from "@/lib/demo-data";
import {
  isEventId,
  isRankingType,
  isRegionScope,
  type RankingEntry,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 120;
const MAX_SEARCH_RESULTS = 500;

type RankingRow = {
  rank: number;
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
    return { rankColumn: "continent_rank", regionColumn: "continent_id" } as const;
  }
  if (scope === "country") {
    return { rankColumn: "country_rank", regionColumn: "country_id" } as const;
  }
  return { rankColumn: "world_rank", regionColumn: null } as const;
}

function addParameter(values: unknown[], value: unknown) {
  values.push(value);
  return "?";
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
  const { rankColumn, regionColumn } = getQueryShape(scope);
  const values: unknown[] = [];
  const conditions = [
    `event_id = ${addParameter(values, eventId)}`,
    `ranking_type = ${addParameter(values, type)}`,
  ];
  if (regionColumn) {
    conditions.push(`${regionColumn} = ${addParameter(values, regionId)}`);
  }
  return { rankColumn, conditions, values };
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
  searchLimit: number;
  paged: boolean;
}) {
  const filter = makeFilters({ eventId, type, scope, regionId });
  const { rankColumn, conditions } = filter;

  if (locate) {
    const values = [...filter.values];
    const locateParameter = addParameter(values, locate);
    const located = await query<RankingRow>(
      `SELECT ${rankColumn} AS rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name
      FROM ranking_entries
      WHERE ${conditions.join(" AND ")} AND person_id = ${locateParameter}
      LIMIT 1`,
      values,
    );

    return { located: located.rows[0] ? toRankingEntry(located.rows[0]) : null, source: "wca" as const };
  }

  if (search) {
    const values = [...filter.values];
    const searchNameParameter = addParameter(values, `%${search}%`);
    const searchIdParameter = addParameter(values, `%${search}%`);
    const searchResult = await query<RankingRow>(
      `SELECT ${rankColumn} AS rank, person_id, person_name, country_id, country_name,
        country_iso2, continent_id, best, competition_id, competition_name
      FROM ranking_entries
      WHERE ${conditions.join(" AND ")}
        AND (person_name LIKE ${searchNameParameter} OR person_id LIKE ${searchIdParameter})
      ORDER BY ${rankColumn}, person_id
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

  const values = [...filter.values];
  const pageConditions = [...conditions];
  const cursorClause = paged
    ? ` AND ${rankColumn} >= ${addParameter(values, startRank)} AND ${rankColumn} < ${addParameter(values, startRank + limit)}`
    : cursorRank
      ? ` AND (${rankColumn} > ${addParameter(values, cursorRank)} OR (${rankColumn} = ${addParameter(values, cursorRank)} AND person_id > ${addParameter(values, cursorId)}))`
      : ` AND ${rankColumn} >= ${addParameter(values, startRank)}`;
  pageConditions.push(cursorClause.slice(5));
  const limitParameter = paged ? "" : ` LIMIT ${addParameter(values, limit + 1)}`;
  const querySql = `SELECT ${rankColumn} AS rank, person_id, person_name, country_id, country_name,
      country_iso2, continent_id, best, competition_id, competition_name
    FROM ranking_entries
    WHERE ${pageConditions.join(" AND ")}
    ORDER BY ${rankColumn}, person_id${limitParameter}`;

  const nextPageRank = paged
    ? query<{ rank: number | null }>(
      `SELECT MIN(${rankColumn}) AS rank FROM ranking_entries WHERE ${conditions.join(" AND ")} AND ${rankColumn} >= ?`,
      [...filter.values, startRank + limit],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);
  const previousPageRank = paged && startRank > 1
    ? query<{ rank: number | null }>(
      `SELECT MAX(${rankColumn}) AS rank FROM ranking_entries WHERE ${conditions.join(" AND ")} AND ${rankColumn} < ?`,
      [...filter.values, startRank],
    ).then((result) => result.rows[0] ?? null)
    : Promise.resolve(null);

  const countValues = [eventId, type, scope, regionId];
  const [result, countResult, exportDateResult, fetchedAtResult, nextRankRow, previousRankRow] = await Promise.all([
    query<RankingRow>(querySql, values),
    query<{ count: number }>(
      "SELECT count FROM ranking_counts WHERE event_id = ? AND ranking_type = ? AND scope = ? AND region_id = ?",
      countValues,
    ),
    query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'export_date'"),
    query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'fetched_at'"),
    nextPageRank,
    previousPageRank,
  ]);

  const rows = result.rows.map(toRankingEntry);
  const countRow = countResult.rows[0];
  const exportDateRow = exportDateResult.rows[0];
  const fetchedAtRow = fetchedAtResult.rows[0];
  const total = Number(countRow?.count ?? 0);
  const nextPageStart = nextRankRow?.rank
    ? Math.floor((Number(nextRankRow.rank) - 1) / limit) * limit + 1
    : null;
  const previousPageStart = previousRankRow?.rank
    ? Math.floor((Number(previousRankRow.rank) - 1) / limit) * limit + 1
    : null;
  const hasMore = paged ? nextPageStart !== null : rows.length > limit;
  const entries = paged ? rows : (hasMore ? rows.slice(0, limit) : rows);
  const last = entries.at(-1);

  return {
    entries,
    hasMore,
    nextPageStart,
    previousPageStart,
    nextCursor: last ? { rank: last.rank, personId: last.personId } : null,
    total,
    exportDate: exportDateRow?.value ?? null,
    fetchedAt: fetchedAtRow?.value ?? exportDateRow?.value ?? null,
    source: "wca" as const,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawEventId = url.searchParams.get("event");
  const rawType = url.searchParams.get("type");
  const rawScope = url.searchParams.get("scope");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const type = isRankingType(rawType) ? rawType : "single";
  const scope = isRegionScope(rawScope) ? rawScope : "world";
  const regionId = scope === "world" ? "" : (url.searchParams.get("region") ?? "");
  const paged = url.searchParams.get("paged") === "1";
  const requestedLimit = Number(url.searchParams.get("limit")) || (paged ? 100 : 80);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(20, requestedLimit));
  const requestedStartRank = Math.max(1, Number(url.searchParams.get("start")) || 1);
  // The caller chooses the page anchor. Search jumps use an exact rank window
  // so rank gaps cannot leave the matched competitor just outside the page.
  const startRank = requestedStartRank;
  const cursorRank = Number(url.searchParams.get("cursorRank")) || null;
  const cursorId = url.searchParams.get("cursorId") ?? "";
  const locate = (url.searchParams.get("locate") ?? "").trim().toUpperCase();
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
  const requestedSearchLimit = Number(url.searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS;
  const searchLimit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, requestedSearchLimit));

  if (scope !== "world" && !regionId) {
    return Response.json({ error: "Choose a region before loading rankings." }, { status: 400 });
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
      searchLimit,
      paged,
    });
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } });
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
      return Response.json({ located, source: "demo" });
    }

    if (search) {
      const normalizedSearch = search.toLocaleLowerCase();
      const searchEntries = makeDemoRankings({ eventId, type, scope, regionId, startRank: 1, limit: searchLimit })
        .filter((entry) => entry.personName.toLocaleLowerCase().includes(normalizedSearch) || entry.personId.toLocaleLowerCase().includes(normalizedSearch));
      return Response.json({ entries: searchEntries, total: searchEntries.length, source: "demo" });
    }

    const last = entries.at(-1);
    const hasMore = startRank + limit <= 248_392;
    return Response.json({
      entries,
      hasMore,
      nextPageStart: hasMore ? startRank + limit : null,
      previousPageStart: startRank > 1 ? Math.max(1, startRank - limit) : null,
      nextCursor: last ? { rank: last.rank, personId: last.personId } : null,
      total: 248_392,
      exportDate: null,
      source: "demo",
    });
  }
}
