import { queryMysql } from "./api/rankings/route";
import { RankingsExplorer } from "./components/RankingsExplorer";
import { getRegions } from "@/lib/regions";
import { isEventId, isRankingType, isValidRegexPattern, parseRegionQuery } from "@/lib/wca";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function searchPageStartForRank(rank: number) {
  return Math.max(1, Math.max(1, rank) - Math.floor(PAGE_SIZE / 2));
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getSearchParamWithLegacyKey(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
  legacyKey: string,
) {
  return getSearchParam(searchParams, key) || getSearchParam(searchParams, legacyKey);
}

function getCanonicalSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  eventId: string,
  rankingType: "single" | "average",
  regionId: string,
) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  params.delete("event");
  params.delete("type");
  params.delete("scope");
  params.delete("regex");
  if (eventId === "333") params.delete("eventId");
  else params.set("eventId", eventId);
  if (rankingType === "single") params.delete("result");
  else params.set("result", rankingType);
  if (regionId) params.set("region", regionId);
  else params.delete("region");
  const search = getSearchParam(searchParams, "search").trim();
  if (getSearchParam(searchParams, "mode") === "vim" && search) params.set("mode", "vim");
  else params.delete("mode");
  return params;
}

async function getInitialRankings(searchParams: Record<string, string | string[] | undefined>) {
  const rawEventId = getSearchParamWithLegacyKey(searchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(searchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const regexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(search);
  const queryOptions = {
    eventId,
    type: rankingType,
    scope,
    regionId,
    cursorRank: null,
    cursorId: "",
    locate: "",
  } as const;

  const searchResult = search
    ? await queryMysql({ ...queryOptions, startRank: 1, limit: PAGE_SIZE, search, regexSearch, searchLimit: 500, paged: false })
    : null;
  const searchMatches = searchResult && "entries" in searchResult && Array.isArray(searchResult.entries)
    ? searchResult.entries
    : [];
  const firstMatch = searchMatches[0];
  const startRank = firstMatch ? searchPageStartForRank(firstMatch.subRank) : 1;
  const page = await queryMysql({
    ...queryOptions,
    startRank,
    limit: PAGE_SIZE,
    search: "",
    searchLimit: 500,
    paged: true,
    focusPersonId: firstMatch?.personId ?? "",
  });

  if (!("entries" in page) || !Array.isArray(page.entries)) throw new Error("Initial ranking page was unavailable.");
  return {
    entries: page.entries,
    hasMore: page.hasMore ?? false,
    nextPageStart: page.nextPageStart ?? null,
    previousPageStart: page.previousPageStart ?? null,
    startPosition: page.startPosition ?? Math.max(0, startRank - 1),
    lastRank: page.lastRank ?? null,
    total: page.total ?? 0,
    fetchedAt: page.fetchedAt ?? page.exportDate ?? null,
    startRank,
    searchMatches,
    initialMatchPersonId: firstMatch?.personId ?? "",
    regexSearch,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawEventId = getSearchParamWithLegacyKey(resolvedSearchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(resolvedSearchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(resolvedSearchParams, "region"));
  const canonicalParams = getCanonicalSearchParams(resolvedSearchParams, eventId, rankingType, regionId);
  const currentParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => currentParams.append(key, item));
    else if (value !== undefined) currentParams.set(key, value);
  });
  if (canonicalParams.toString() !== currentParams.toString()) {
    const query = canonicalParams.toString();
    redirect(query ? `/?${query}` : "/");
  }
  const [initialRankings, continents, countries] = await Promise.all([
    getInitialRankings(resolvedSearchParams),
    getRegions("continent"),
    getRegions("country"),
  ]);
  const initialSearch = getSearchParam(resolvedSearchParams, "search").trim().slice(0, 80);
  const initialRegexSearch = getSearchParam(resolvedSearchParams, "mode") === "vim" && isValidRegexPattern(initialSearch);
  return (
    <RankingsExplorer
      initialData={initialRankings}
      initialSearch={initialSearch}
      initialRegexSearch={initialRegexSearch}
      initialEventId={eventId}
      initialRankingType={rankingType}
      initialRegionSelection={{ scope, regionId }}
      initialRegions={{ continents, countries }}
    />
  );
}
