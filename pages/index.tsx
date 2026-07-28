import type { GetServerSideProps } from "next";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import type {
  RankingEntry,
  RankingPage,
} from "@/components/RankingsExplorer/types";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { isEventId, isRankingType, isValidRegexPattern, parseRegionQuery, WCA_EVENTS } from "@/lib/wca";

const PAGE_SIZE = RESULTS_PAGE_SIZE;

function pageFirstSubRank(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
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

type RankingsResponse = Partial<RankingPage> & {
  entries: RankingEntry[];
};

type RegionRecord = {
  id: string;
  name: string;
  iso2?: string;
};

async function fetchRankings(
  origin: string,
  params: URLSearchParams,
): Promise<RankingsResponse> {
  const response = await fetch(`${origin}/api/rankings?${params}`);
  if (!response.ok) {
    throw new Error("Initial ranking page was unavailable.");
  }
  return response.json() as Promise<RankingsResponse>;
}

async function fetchRegions(
  origin: string,
  kind: "continent" | "country",
): Promise<RegionRecord[]> {
  const response = await fetch(`${origin}/api/regions?kind=${kind}`);
  if (!response.ok) {
    throw new Error("Regions were unavailable.");
  }
  const data = await response.json() as { regions?: unknown };
  if (!Array.isArray(data.regions)) {
    throw new Error("Regions were unavailable.");
  }
  return data.regions as RegionRecord[];
}

async function getInitialRankings(
  searchParams: Record<string, string | string[] | undefined>,
  origin: string,
) {
  const rawEventId = getSearchParamWithLegacyKey(searchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(searchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const regexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(search);
  const searchResult = search
    ? await fetchRankings(
        origin,
        new URLSearchParams({
          eventId,
          result: rankingType,
          search,
          searchLimit: "500",
          ...(regexSearch ? { mode: "vim" } : {}),
          ...(scope === "world" ? {} : { region: regionId }),
        }),
      )
    : null;
  const searchMatches = searchResult && Array.isArray(searchResult.entries)
    ? searchResult.entries
    : [];
  const firstMatch = searchMatches[0];
  const targetPageStart = pageFirstSubRank(firstMatch?.subRank ?? 1);
  const pageStarts = firstMatch
    ? [targetPageStart - PAGE_SIZE, targetPageStart, targetPageStart + PAGE_SIZE]
        .filter((start) => start > 0)
    : [1];
  const pages = await Promise.all(
    pageStarts.map((startRank) =>
      fetchRankings(
        origin,
        new URLSearchParams({
          eventId,
          result: rankingType,
          start: String(startRank - 1),
          limit: String(PAGE_SIZE),
          paged: "1",
          ...(scope === "world" ? {} : { region: regionId }),
        }),
      ),
    ),
  );
  if (pages.some((page) => !Array.isArray(page.entries))) {
    throw new Error("Initial ranking page was unavailable.");
  }
  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  if (!Array.isArray(firstPage.entries) || !Array.isArray(lastPage.entries)) {
    throw new Error("Initial ranking page was unavailable.");
  }
  const entries = pages.flatMap((page) => page.entries);
  const startRank = pageStarts[0];
  return {
    entries,
    hasMore: lastPage.hasMore ?? false,
    nextPageStart: lastPage.nextPageStart ?? null,
    previousPageStart: firstPage.previousPageStart ?? null,
    startPosition: firstPage.startPosition ?? Math.max(0, startRank - 1),
    lastRank: lastPage.lastRank ?? null,
    total: lastPage.total ?? 0,
    fetchedAt: lastPage.fetchedAt ?? lastPage.exportDate ?? null,
    startRank,
    searchMatches,
    initialMatchPersonId: firstMatch?.personId ?? "",
    regexSearch,
  };
}

type QueryParams = Record<string, string | string[] | undefined>;

type PageProps = {
  initialRankings: Awaited<ReturnType<typeof getInitialRankings>>;
  initialSearch: string;
  initialRegexSearch: boolean;
  eventId: (typeof WCA_EVENTS)[number]["id"];
  rankingType: "single" | "average";
  scope: ReturnType<typeof parseRegionQuery>["scope"];
  regionId: string;
  continents: Array<{ id: string; name: string }>;
  countries: Array<{ id: string; name: string; iso2?: string }>;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  query,
  req,
}) => {
  const searchParams = query as QueryParams;
  const rawEventId = getSearchParamWithLegacyKey(searchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(searchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const canonicalParams = getCanonicalSearchParams(searchParams, eventId, rankingType, regionId);
  const currentParams = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => currentParams.append(key, item));
    else if (value !== undefined) currentParams.set(key, value);
  });
  if (canonicalParams.toString() !== currentParams.toString()) {
    const query = canonicalParams.toString();
    return { redirect: { destination: query ? `/?${query}` : "/", permanent: false } };
  }
  const forwardedProtocol = req.headers["x-forwarded-proto"];
  const protocol = (
    Array.isArray(forwardedProtocol)
      ? forwardedProtocol[0]
      : forwardedProtocol
  )?.split(",")[0] ?? "http";
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (
    Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost
  )?.split(",")[0] ?? req.headers.host ?? "localhost:3000";
  const origin = `${protocol}://${host}`;
  const [initialRankings, continents, countries] = await Promise.all([
    getInitialRankings(searchParams, origin),
    fetchRegions(origin, "continent"),
    fetchRegions(origin, "country"),
  ]);
  const initialSearch = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const initialRegexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(initialSearch);
  return {
    props: {
      initialRankings,
      initialSearch,
      initialRegexSearch,
      eventId,
      rankingType,
      scope,
      regionId,
      continents,
      countries,
    },
  };
};

export default function Home({
  initialRankings,
  initialSearch,
  initialRegexSearch,
  eventId,
  rankingType,
  scope,
  regionId,
  continents,
  countries,
}: PageProps) {
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
