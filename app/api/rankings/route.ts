import { env } from "cloudflare:workers";
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

type D1Row = {
  rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
};

function toRankingEntry(row: D1Row): RankingEntry {
  return {
    rank: Number(row.rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
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

async function queryD1({
  eventId,
  type,
  scope,
  regionId,
  startRank,
  cursorRank,
  cursorId,
  limit,
  locate,
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
  paged: boolean;
}) {
  const database = env.DB;
  if (!database) throw new Error("D1 is not available");

  const { rankColumn, regionColumn } = getQueryShape(scope);
  const regionClause = regionColumn ? ` AND ${regionColumn} = ?` : "";
  const regionBindings = regionColumn ? [regionId] : [];

  if (locate) {
    const located = await database
      .prepare(
        `SELECT ${rankColumn} AS rank, person_id, person_name, country_id, country_name,
          country_iso2, continent_id, best
        FROM ranking_entries
        WHERE event_id = ? AND ranking_type = ? AND person_id = ?${regionClause}
        LIMIT 1`,
      )
      .bind(eventId, type, locate, ...regionBindings)
      .first<D1Row>();

    return { located: located ? toRankingEntry(located) : null, source: "wca" as const };
  }

  const cursorClause = paged
    ? ` AND ${rankColumn} >= ? AND ${rankColumn} < ?`
    : cursorRank
      ? ` AND (${rankColumn} > ? OR (${rankColumn} = ? AND person_id > ?))`
      : ` AND ${rankColumn} >= ?`;
  const cursorBindings = paged
    ? [startRank, startRank + limit]
    : cursorRank
      ? [cursorRank, cursorRank, cursorId]
      : [startRank];
  const querySql =
    `SELECT ${rankColumn} AS rank, person_id, person_name, country_id, country_name,
      country_iso2, continent_id, best
    FROM ranking_entries
    WHERE event_id = ? AND ranking_type = ?${regionClause}${cursorClause}
    ORDER BY ${rankColumn}, person_id${paged ? "" : " LIMIT ?"}`;
  const queryBindings = paged
    ? [eventId, type, ...regionBindings, ...cursorBindings]
    : [eventId, type, ...regionBindings, ...cursorBindings, limit + 1];
  const query = database.prepare(querySql).bind(...queryBindings);

  const nextPageRank = paged
    ? database
        .prepare(
          `SELECT MIN(${rankColumn}) AS rank
           FROM ranking_entries
           WHERE event_id = ? AND ranking_type = ?${regionClause} AND ${rankColumn} >= ?`,
        )
        .bind(eventId, type, ...regionBindings, startRank + limit)
        .first<{ rank: number | null }>()
    : Promise.resolve(null);
  const previousPageRank = paged && startRank > 1
    ? database
        .prepare(
          `SELECT MAX(${rankColumn}) AS rank
           FROM ranking_entries
           WHERE event_id = ? AND ranking_type = ?${regionClause} AND ${rankColumn} < ?`,
        )
        .bind(eventId, type, ...regionBindings, startRank)
        .first<{ rank: number | null }>()
    : Promise.resolve(null);

  const [result, countRow, exportDateRow, nextRankRow, previousRankRow] = await Promise.all([
    query.all<D1Row>(),
    database
      .prepare(
        `SELECT count FROM ranking_counts
         WHERE event_id = ? AND ranking_type = ? AND scope = ? AND region_id = ?`,
      )
      .bind(eventId, type, scope, regionId)
      .first<{ count: number }>(),
    database
      .prepare("SELECT value FROM export_metadata WHERE key = 'export_date'")
      .first<{ value: string }>(),
    nextPageRank,
    previousPageRank,
  ]);

  const rows = result.results.map(toRankingEntry);
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
  const startRank = paged
    ? Math.floor((requestedStartRank - 1) / limit) * limit + 1
    : requestedStartRank;
  const cursorRank = Number(url.searchParams.get("cursorRank")) || null;
  const cursorId = url.searchParams.get("cursorId") ?? "";
  const locate = (url.searchParams.get("locate") ?? "").trim().toUpperCase();

  if (scope !== "world" && !regionId) {
    return Response.json({ error: "Choose a region before loading rankings." }, { status: 400 });
  }

  try {
    const data = await queryD1({
      eventId,
      type,
      scope,
      regionId,
      startRank,
      cursorRank,
      cursorId,
      limit,
      locate,
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
