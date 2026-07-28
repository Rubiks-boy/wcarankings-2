import type { RecordBadgeCode, RegionScope } from "@/lib/wca";

export type RankingEntry = {
  rank: number;
  subRank: number;
  personId: string;
  personName: string;
  countryName: string;
  countryIso2: string;
  best: number;
  competitionId: string;
  competitionName: string;
  recordBadges: RecordBadgeCode[];
};

export type RankingPage = {
  entries: RankingEntry[];
  hasMore: boolean;
  nextPageStart: number | null;
  previousPageStart: number | null;
  startPosition: number;
  lastRank: number | null;
  total: number;
  exportDate?: string | null;
  fetchedAt: string | null;
  offlineStale?: boolean;
};

export type InitialRankingData = Pick<
  RankingPage,
  | "entries"
  | "hasMore"
  | "nextPageStart"
  | "previousPageStart"
  | "total"
  | "exportDate"
  | "fetchedAt"
> & {
  startRank: number;
  startPosition: number;
  lastRank: number | null;
  searchMatches: RankingEntry[];
  initialMatchPersonId: string;
  regexSearch?: boolean;
};

export type RegionOption = {
  key: string;
  scope: RegionScope;
  regionId: string;
  label: string;
  iso2?: string;
};

export type RegionSelection = Pick<RegionOption, "scope" | "regionId">;

const rankingNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function formatRankingNumber(value: number) {
  return rankingNumberFormatter.format(value);
}

export function formatFetchedAgo(value: string) {
  const fetchedAt = new Date(value).getTime();
  if (!Number.isFinite(fetchedAt)) return "time unavailable";
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - fetchedAt) / 60_000),
  );
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60)
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24)
    return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

export function formatExportDate(value: string) {
  const exportDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(exportDate.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(exportDate);
}

export function formatRankingsFreshness(exportDate: string | null, fetchedAt: string | null) {
  if (exportDate) return `WCA export dated ${formatExportDate(exportDate)}`;
  if (fetchedAt) return `Imported ${formatFetchedAgo(fetchedAt)}`;
  return "WCA export date unavailable";
}
