import { queryMysql } from "./api/rankings/route";
import { RankingsExplorer } from "./components/RankingsExplorer";
import { makeDemoRankings } from "@/lib/demo-data";
import { isEventId, isRankingType, isRegionScope } from "@/lib/wca";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function pageStartForRank(rank: number) {
  return Math.floor((Math.max(1, rank) - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getInitialRankings(searchParams: Record<string, string | string[] | undefined>) {
  const rawEventId = getSearchParam(searchParams, "event");
  const rawRankingType = getSearchParam(searchParams, "type");
  const rawScope = getSearchParam(searchParams, "scope");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = isRankingType(rawRankingType) ? rawRankingType : "single";
  const scope = isRegionScope(rawScope) ? rawScope : "world";
  const regionId = scope === "world" ? "" : getSearchParam(searchParams, "region");
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const queryOptions = {
    eventId,
    type: rankingType,
    scope,
    regionId,
    cursorRank: null,
    cursorId: "",
    locate: "",
  } as const;

  try {
    const searchResult = search
      ? await queryMysql({ ...queryOptions, startRank: 1, limit: PAGE_SIZE, search, searchLimit: 500, paged: false })
      : null;
    const searchMatches = searchResult && "entries" in searchResult ? searchResult.entries : [];
    const firstMatch = searchMatches[0];
    const startRank = firstMatch ? pageStartForRank(firstMatch.rank) : 1;
    const page = await queryMysql({
      ...queryOptions,
      startRank,
      limit: PAGE_SIZE,
      search: "",
      searchLimit: 500,
      paged: true,
    });

    if (!("entries" in page)) throw new Error("Initial ranking page was unavailable.");
    return {
      entries: page.entries,
      hasMore: page.hasMore,
      nextPageStart: page.nextPageStart,
      previousPageStart: page.previousPageStart,
      total: page.total,
      fetchedAt: page.fetchedAt ?? page.exportDate ?? null,
      startRank,
      searchMatches,
      initialMatchPersonId: firstMatch?.personId ?? "",
    };
  } catch {
    const entries = makeDemoRankings({ eventId, type: rankingType, scope, regionId, startRank: 1, limit: PAGE_SIZE });
    const searchMatches = search
      ? entries.filter((entry) => entry.personName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || entry.personId.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
      : [];
    return {
      entries,
      hasMore: true,
      nextPageStart: PAGE_SIZE + 1,
      previousPageStart: null,
      total: 248_392,
      fetchedAt: null,
      startRank: 1,
      searchMatches,
      initialMatchPersonId: searchMatches[0]?.personId ?? "",
    };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialRankings = await getInitialRankings(resolvedSearchParams);
  const initialSearch = getSearchParam(resolvedSearchParams, "search").trim().slice(0, 80);
  return <RankingsExplorer initialData={initialRankings} initialSearch={initialSearch} />;
}
