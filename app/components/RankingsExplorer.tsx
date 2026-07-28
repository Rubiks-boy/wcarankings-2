"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  animateScrollTo,
  cancelScrollAnimation,
  getCurrentViewportPosition,
  getCurrentViewportSubRank,
  getScrollAnimationDuration,
  getSearchAnimationDuration,
  getSearchBridgePageStarts,
  getSearchJumpMode,
  isDuplicateRank,
  scrollToEntry,
  type ScrollAnimationState,
  SCROLL_SETTLE_DELAY_MS,
} from "./scrollEngine";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  formatWcaResult,
  isEventId,
  isRankingType,
  parseRegionQuery,
  WCA_EVENTS,
  type RegionScope,
} from "@/lib/wca";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const SEARCH_PAGE_RADIUS = 1;
const SEARCH_PREFETCH_RADIUS = 3;
const SEARCH_ANIMATION_ROWS = 3;
const VIM_JUMP_PAGE_COUNT = 2;
const VIM_JUMP_SIZE = PAGE_SIZE * VIM_JUMP_PAGE_COUNT;
const ROW_HEIGHT = 61.6;
const rankingNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
function formatRankingNumber(value: number) {
  return rankingNumberFormatter.format(value);
}

function formatFetchedAgo(value: string) {
  const fetchedAt = new Date(value).getTime();
  if (!Number.isFinite(fetchedAt)) return "time unavailable";
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - fetchedAt) / 60_000)
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

function updateQueryParams(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(updates).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}`
  );
}

function setSearchQueryParam(value: string) {
  updateQueryParams({ search: value.trim() ? value : null });
}

type RankingEntry = {
  rank: number;
  subRank: number;
  personId: string;
  personName: string;
  best: number;
  competitionId: string;
  competitionName: string;
};

type RankingPage = {
  entries: RankingEntry[];
  hasMore: boolean;
  nextPageStart: number | null;
  previousPageStart: number | null;
  startPosition: number;
  lastRank: number | null;
  total: number;
  fetchedAt: string | null;
  exportDate?: string | null;
};

type SearchLayoutAnchor = {
  requestEpoch: number;
  personId: string;
  viewportTop: number;
};

type InitialRankingData = Pick<
  RankingPage,
  | "entries"
  | "hasMore"
  | "nextPageStart"
  | "previousPageStart"
  | "total"
  | "fetchedAt"
> & {
  startRank: number;
  startPosition: number;
  lastRank: number | null;
  searchMatches: RankingEntry[];
  initialMatchPersonId: string;
  regexSearch?: boolean;
};

type RegionOption = {
  key: string;
  scope: RegionScope;
  regionId: string;
  label: string;
  iso2?: string;
};

type RegionSelection = Pick<RegionOption, "scope" | "regionId">;

const pageCache = new Map<string, Promise<RankingPage>>();

async function fetchRankingPage(input: RequestInfo | URL) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(input);
    } catch (error) {
      lastError = error;
      if (attempt === 0)
        await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Rankings are unavailable.");
}

function pageStartForSubRank(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE;
}

function orderSearchMatches(matches: RankingEntry[]) {
  return [...matches].sort(
    (left, right) =>
      left.subRank - right.subRank ||
      left.rank - right.rank ||
      left.personName.localeCompare(right.personName) ||
      left.personId.localeCompare(right.personId)
  );
}

function getPage(
  eventId: string,
  rankingType: "single" | "average",
  start: number,
  selection: RegionSelection
) {
  const pageStart = pageStartForSubRank(start);
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    start: String(pageStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  if (selection.scope !== "world") params.set("region", selection.regionId);
  const cacheKey = params.toString();
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  const request = fetchRankingPage(`/api/rankings?${params}`).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Rankings are unavailable.");
    }
    const data = (await response.json()) as RankingPage;
    return {
      entries: data.entries,
      hasMore: data.hasMore,
      nextPageStart: data.nextPageStart,
      previousPageStart: data.previousPageStart,
      startPosition: data.startPosition,
      lastRank: data.lastRank,
      total: data.total,
      fetchedAt: data.fetchedAt ?? data.exportDate ?? null,
    };
  });

  pageCache.set(cacheKey, request);
  request.catch(() => pageCache.delete(cacheKey));
  return request;
}

async function getSearchWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  match: RankingEntry
) {
  const targetPageStart = pageStartForSubRank(match.subRank);
  const pageFirstSubRanks = Array.from(
    { length: SEARCH_PAGE_RADIUS * 2 + 1 },
    (_, index) =>
      targetPageStart + 1 + (index - SEARCH_PAGE_RADIUS) * PAGE_SIZE
  )
    .filter((start) => start > 0)
    .filter((start, index, starts) => starts.indexOf(start) === index);
  const pages = await Promise.all(
    pageFirstSubRanks.map((start) =>
      getPage(eventId, rankingType, start, selection)
    )
  );
  const entries = pages.flatMap((page) => page.entries);
  if (!entries.some((entry) => entry.personId === match.personId))
    throw new Error("Could not locate the selected ranking result.");

  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  return {
    ...lastPage,
    entries,
    startPosition: firstPage.startPosition,
    previousPageStart: firstPage.previousPageStart,
    nextPageStart: lastPage.nextPageStart,
  };
}

async function getDistantSearchWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  currentPageStart: number,
  match: RankingEntry,
  direction: -1 | 1
) {
  const targetPageStart = pageStartForSubRank(match.subRank);
  const pageStarts = [
    currentPageStart,
    ...getSearchBridgePageStarts(
      currentPageStart,
      targetPageStart,
      direction,
      PAGE_SIZE
    ),
    targetPageStart - PAGE_SIZE,
    targetPageStart,
    targetPageStart + PAGE_SIZE,
  ]
    .filter((start) => start >= 0)
    .filter((start, index, starts) => starts.indexOf(start) === index)
    .sort((left, right) => left - right);
  const pages = (
    await Promise.all(
      pageStarts.map((start) =>
        getPage(eventId, rankingType, start + 1, selection)
      )
    )
  ).filter((page) => page.entries.length > 0);
  const entries = pages.flatMap((page) => page.entries);
  if (!entries.some((entry) => entry.personId === match.personId))
    throw new Error("Could not locate the selected ranking result.");

  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  return {
    ...lastPage,
    entries,
    startPosition: firstPage.startPosition,
    previousPageStart: firstPage.previousPageStart,
    nextPageStart: lastPage.nextPageStart,
  };
}

function prefetchSearchResultPages(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  matches: RankingEntry[],
  currentMatchIndex: number
) {
  if (matches.length < 2 || currentMatchIndex < 0) return;
  const requested = new Set<number>();

  for (const direction of [-1, 1] as const) {
    for (let distance = 1; distance <= SEARCH_PREFETCH_RADIUS; distance += 1) {
      const matchIndex =
        (currentMatchIndex + direction * distance + matches.length) %
        matches.length;
      const match = matches[matchIndex];
      const requestKey = pageStartForSubRank(match.subRank);
      if (requested.has(requestKey)) continue;
      requested.add(requestKey);
      void getSearchWindow(eventId, rankingType, selection, match).catch(
        () => undefined
      );
    }
  }
}

function searchRankings(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  search: string,
  regexSearch: boolean,
  signal: AbortSignal
) {
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    search,
    searchLimit: "500",
  });
  if (regexSearch) params.set("mode", "vim");
  if (selection.scope !== "world") params.set("region", selection.regionId);

  return fetch(`/api/rankings?${params}`, { signal }).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Search is unavailable.");
    }
    return response.json() as Promise<{ entries: RankingEntry[] }>;
  });
}

function Arrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24"
      viewBox="0 -960 960 960"
      width="24"
      aria-hidden="true"
    >
      <path
        d={
          direction === "up"
            ? "M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z"
            : "M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z"
        }
      />
    </svg>
  );
}

function SelectArrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M7 10L12 15L17 10"
        stroke="#000000"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="10.75"
        cy="10.75"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M15 15L20 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RegionPicker({
  options,
  selected,
  onChange,
}: {
  options: RegionOption[];
  selected: RegionSelection;
  onChange: (option: RegionOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedOption =
    options.find(
      (option) =>
        option.scope === selected.scope && option.regionId === selected.regionId
    ) ?? options[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery)
      )
    : options;
  const continents = filteredOptions.filter(
    (option) => option.scope === "continent"
  );
  const countries = filteredOptions.filter(
    (option) => option.scope === "country"
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const choose = (option: RegionOption) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const renderOption = (option: RegionOption) => (
    <button
      className={`regionOption${
        selectedOption?.key === option.key ? " isSelected" : ""
      }`}
      type="button"
      role="option"
      aria-selected={selectedOption?.key === option.key}
      onClick={() => choose(option)}
      key={option.key}
    >
      <span>{option.label}</span>
    </button>
  );

  return (
    <div className="regionPicker" ref={pickerRef}>
      <input
        className="regionPickerTrigger"
        id="region-picker-button"
        type="search"
        ref={searchRef}
        value={open ? query : selectedOption?.label ?? "World"}
        onFocus={() => {
          if (!open) setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery("");
            setOpen(false);
          }
        }}
        aria-label="Region"
        aria-haspopup="listbox"
      />
      {open && (
        <div className="regionPickerMenu" role="listbox" aria-label="Region">
          {filteredOptions.length === 0 ? (
            <div className="regionEmpty">No matching regions</div>
          ) : (
            <div className="regionOptions">
              {renderOption(options[0])}
              {continents.length > 0 && (
                <div className="regionGroupLabel">Continents</div>
              )}
              {continents.map(renderOption)}
              {countries.length > 0 && (
                <div className="regionGroupLabel">Countries</div>
              )}
              {countries.map(renderOption)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RankingRow({
  entry,
  eventId,
  rankingType,
  loading,
  animationIndex,
  searchMatched = false,
  highlighted = false,
  rankIsDuplicate = false,
}: {
  entry: RankingEntry | null;
  eventId: string;
  rankingType: "single" | "average";
  loading: boolean;
  animationIndex: number;
  searchMatched?: boolean;
  highlighted?: boolean;
  rankIsDuplicate?: boolean;
}) {
  const style = {
    "--t-animation-delay": `${animationIndex * 10}ms`,
    minHeight: `${ROW_HEIGHT}px`,
  } as React.CSSProperties;
  const isLoading = loading || !entry;

  return (
    <li
      className={`listItem${isLoading ? " isLoading" : ""}`}
      data-person-id={entry?.personId}
      style={style}
    >
      {isLoading ? (
        <div
          className={`row loaderRow${
            animationIndex % 2 === 1 ? " row--alternate" : ""
          }`}
          aria-hidden="true"
        >
          <div className="rank loaderBlob" />
          <div className="name loaderBlob" />
          <div className="best loaderBlob" />
        </div>
      ) : (
        <div
          className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}${
            searchMatched ? " row--searchResult" : ""
          }${
            highlighted ? " row--searchMatch" : ""
          }`}
        >
          <span
            className={`rank${rankIsDuplicate ? " rank--duplicate" : ""}`}
          >
            {formatRankingNumber(entry.rank)}
          </span>
          <span className="identity">
            <span className="name">{entry.personName}</span>
            <span className="wcaId">{entry.personId}</span>
          </span>
          <span className="result">
            <span className="best">
              {formatWcaResult(eventId, entry.best, rankingType)}
            </span>
            {entry.competitionName && (
              <span className="competitionName" title={entry.competitionName}>
                {entry.competitionName}
              </span>
            )}
          </span>
        </div>
      )}
    </li>
  );
}

export function RankingsExplorer({
  initialData,
  initialSearch = "",
  initialRegexSearch = initialData?.regexSearch ?? false,
  initialEventId = "333",
  initialRankingType = "single",
  initialRegionSelection = { scope: "world", regionId: "" },
  initialRegions = {
    continents: FALLBACK_CONTINENTS,
    countries: FALLBACK_COUNTRIES,
  },
}: {
  initialData?: InitialRankingData;
  initialSearch?: string;
  initialRegexSearch?: boolean;
  initialEventId?: (typeof WCA_EVENTS)[number]["id"];
  initialRankingType?: "single" | "average";
  initialRegionSelection?: RegionSelection;
  initialRegions?: {
    continents: Array<{ id: string; name: string }>;
    countries: Array<{ id: string; name: string; iso2?: string }>;
  };
}) {
  const normalizedInitialSearch = initialSearch.trim();
  const [eventId, setEventId] = useState(initialEventId);
  const [rankingType, setRankingType] = useState<"single" | "average">(
    initialRankingType
  );
  const [regionSelection, setRegionSelection] = useState<RegionSelection>(
    initialRegionSelection
  );
  const regions: RegionOption[] = [
    { key: "world", scope: "world", regionId: "", label: "World" },
    ...initialRegions.continents.map((region) => ({
      key: `continent:${region.id}`,
      scope: "continent" as const,
      regionId: region.id,
      label: region.name.replace(/^_/, ""),
    })),
    ...initialRegions.countries.map((region) => ({
      key: `country:${region.id}`,
      scope: "country" as const,
      regionId: region.id,
      label: region.name,
      iso2: region.iso2,
    })),
  ];
  const [entries, setEntries] = useState<RankingEntry[]>(
    initialData?.entries ?? []
  );
  const [startRank, setStartRank] = useState(initialData?.startRank ?? 1);
  const [startPosition, setStartPosition] = useState(
    initialData?.startPosition ?? 0
  );
  const [nextPageStart, setNextPageStart] = useState<number | null>(
    initialData?.nextPageStart ?? null
  );
  const [previousPageStart, setPreviousPageStart] = useState<number | null>(
    initialData?.previousPageStart ?? null
  );
  const [lastRank, setLastRank] = useState<number | null>(
    initialData?.lastRank ?? null
  );
  const [total, setTotal] = useState(
    initialData?.total ?? Number.POSITIVE_INFINITY
  );
  const [fetchedAt, setFetchedAt] = useState<string | null>(
    initialData?.fetchedAt ?? null
  );
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true);
  const [loading, setLoading] = useState(!initialData);
  const [preserveListDuringLoad, setPreserveListDuringLoad] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [findOpen, setFindOpen] = useState(Boolean(normalizedInitialSearch && !initialRegexSearch));
  const [findQuery, setFindQuery] = useState(initialSearch);
  const [regexSearch, setRegexSearch] = useState(initialRegexSearch);
  const [findMatches, setFindMatches] = useState<RankingEntry[]>(
    orderSearchMatches(initialData?.searchMatches ?? [])
  );
  const [findIndex, setFindIndex] = useState(
    initialData?.searchMatches.length ? 0 : -1
  );
  const [findLoading, setFindLoading] = useState(false);
  const [findResolvedQuery, setFindResolvedQuery] = useState(
    normalizedInitialSearch
  );
  const [findError, setFindError] = useState("");
  const [highlightedPersonId, setHighlightedPersonId] = useState(
    initialData?.initialMatchPersonId ?? ""
  );
  const [findFloating, setFindFloating] = useState(false);
  const [debugScrollY, setDebugScrollY] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [vimCommand, setVimCommand] = useState(":");
  const [vimHelpOpen, setVimHelpOpen] = useState(false);
  const [vimSearchActive, setVimSearchActive] = useState(initialRegexSearch);
  const [vimSearchQuery, setVimSearchQuery] = useState(
    initialRegexSearch ? initialSearch : ""
  );
  const [jumpUpArmed, setJumpUpArmed] = useState(false);
  const [jumpDownArmed, setJumpDownArmed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const findBarRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const vimInputRef = useRef<HTMLInputElement>(null);
  const vimCommandRef = useRef(vimCommand);
  const moreRequestRef = useRef(false);
  const previousRequestRef = useRef(false);
  const navigationEpochRef = useRef(0);
  const pendingRankRef = useRef(1);
  const pendingFocusLastRef = useRef(false);
  const pendingScrollToTopRef = useRef(false);
  const pendingScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const pendingNavigationAppendRef = useRef(false);
  const navigationTargetRankRef = useRef<number | null>(null);
  const jumpUpTimerRef = useRef<number | null>(null);
  const jumpDownTimerRef = useRef<number | null>(null);
  const jumpUpArmedRef = useRef(false);
  const jumpDownArmedRef = useRef(false);
  const preserveListDuringLoadRef = useRef(false);
  const scrollRestoreAttemptedRef = useRef(false);
  const scrollPersistenceReadyRef = useRef(false);
  const initialPageKeyRef = useRef(
    initialData
      ? [
          initialEventId,
          initialRankingType,
          initialRegionSelection.scope,
          initialRegionSelection.regionId,
          initialData.startRank,
        ].join(":")
      : ""
  );
  const skipPageLoadStartRef = useRef<number | null>(null);
  const initialScrollRef = useRef(
    Boolean(
      initialData && normalizedInitialSearch && initialData.initialMatchPersonId
    )
  );
  const initialSearchRef = useRef(
    Boolean(initialData && normalizedInitialSearch)
  );
  const findMatchesRef = useRef<RankingEntry[]>(
    orderSearchMatches(initialData?.searchMatches ?? [])
  );
  const findIndexRef = useRef(initialData?.searchMatches.length ? 0 : -1);
  const rankingListRef = useRef<HTMLOListElement>(null);
  const searchAnimationTimerRef = useRef<number | null>(null);
  const searchTransformOffsetRef = useRef(0);
  const pendingSearchLayoutAnchorRef = useRef<SearchLayoutAnchor | null>(null);
  const entriesRef = useRef(entries);
  const startRankRef = useRef(startRank);
  const startPositionRef = useRef(startPosition);
  const scrollAnimationStateRef = useRef<ScrollAnimationState>({
    frame: null,
    active: false,
    programmatic: false,
    clearProgrammaticTimer: null,
    settleTimer: null,
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  const virtualRows = rowVirtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const anchor = pendingSearchLayoutAnchorRef.current;
    if (!anchor) return;
    pendingSearchLayoutAnchorRef.current = null;
    if (anchor.requestEpoch !== navigationEpochRef.current) return;
    const anchoredIndex = entries.findIndex(
      (entry) => entry.personId === anchor.personId
    );
    if (anchoredIndex < 0) return;
    const list = rankingListRef.current;
    const measuredTop = rowVirtualizer.getOffsetForIndex(
      anchoredIndex,
      "start"
    )?.[0];
    const absoluteTop =
      measuredTop ??
      (list?.getBoundingClientRect().top ?? 0) +
        window.scrollY +
        anchoredIndex * ROW_HEIGHT;
    scrollAnimationStateRef.current.programmatic = true;
    window.scrollTo({
      top: Math.max(0, absoluteTop - anchor.viewportTop),
      behavior: "auto",
    });
  }, [entries, rowVirtualizer]);

  useEffect(() => {
    rowVirtualizerRef.current = rowVirtualizer;
  }, [rowVirtualizer]);

  useEffect(() => {
    // This state keeps the server-rendered list in the DOM for the hydration pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  const scrollStorageKey = [
    "wca-rankings-scroll-v1",
    eventId,
    rankingType,
    regionSelection.scope,
    regionSelection.regionId || "world",
    findQuery.trim(),
  ].join(":");

  useEffect(() => {
    if (!hydrated || scrollRestoreAttemptedRef.current) return;
    scrollRestoreAttemptedRef.current = true;
    let savedScrollY = 0;
    try {
      const saved = window.localStorage.getItem(scrollStorageKey);
      const parsed = saved ? (JSON.parse(saved) as { scrollY?: number }) : null;
      if (parsed && Number.isFinite(parsed.scrollY))
        savedScrollY = Math.max(0, parsed.scrollY ?? 0);
    } catch {
      savedScrollY = 0;
    }

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!normalizedInitialSearch && !initialScrollRef.current && savedScrollY > 0)
          window.scrollTo({ top: savedScrollY, behavior: "auto" });
        scrollPersistenceReadyRef.current = true;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [hydrated, normalizedInitialSearch, scrollStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    let saveTimer: number | null = null;
    const saveScrollPosition = () => {
      if (!scrollPersistenceReadyRef.current) return;
      try {
        window.localStorage.setItem(
          scrollStorageKey,
          JSON.stringify({ scrollY: Math.max(0, Math.round(window.scrollY)) })
        );
      } catch {
        // Storage can be unavailable in private browsing or restricted embeds.
      }
    };
    const onScroll = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveScrollPosition();
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", saveScrollPosition);
    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", saveScrollPosition);
    };
  }, [hydrated, scrollStorageKey]);

  useEffect(() => {
    const measure = () => setListOffset(listRef.current?.offsetTop ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [eventId, rankingType, loading, regionSelection]);

  useEffect(() => {
    if (
      !hydrated ||
      !initialScrollRef.current ||
      !initialData?.initialMatchPersonId
    )
      return;
    const targetIndex = entries.findIndex(
      (entry) => entry.personId === initialData.initialMatchPersonId
    );
    if (targetIndex < 0) return;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!initialScrollRef.current) return;
        initialScrollRef.current = false;
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "top",
          requestedDuration: getScrollAnimationDuration(targetIndex),
          schedule: false,
          targetOffset: () =>
            rowVirtualizerRef.current.getOffsetForIndex(
              targetIndex,
              "start"
            )?.[0],
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [entries, hydrated, initialData]);

  useEffect(() => {
    entriesRef.current = entries;
    startRankRef.current = startRank;
    startPositionRef.current = startPosition;
  }, [entries, startPosition, startRank]);

  useEffect(() => {
    const updateFindPosition = () => {
      setFindFloating(window.scrollY > 0);
      setDebugScrollY(window.scrollY);
    };
    updateFindPosition();
    window.addEventListener("scroll", updateFindPosition, { passive: true });
    return () => window.removeEventListener("scroll", updateFindPosition);
  }, []);

  useEffect(() => {
    const syncStateFromUrl = () => {
      const url = new URL(window.location.href);
      const nextEventId =
        url.searchParams.get("eventId") ?? url.searchParams.get("event");
      const nextRankingType =
        url.searchParams.get("result") ?? url.searchParams.get("type");
      const nextRegion = url.searchParams.get("region");
      const search = url.searchParams.get("search") ?? "";
      const resolvedEventId = isEventId(nextEventId) ? nextEventId : "333";
      const resolvedRankingType =
        resolvedEventId === "333mbf"
          ? "single"
          : isRankingType(nextRankingType)
          ? nextRankingType
          : "single";
      const { scope, regionId } = parseRegionQuery(nextRegion);
      setEventId(resolvedEventId);
      setRankingType(resolvedRankingType);
      setRegionSelection({ scope, regionId });
      setFindQuery(search);
      const nextRegexSearch = url.searchParams.get("mode") === "vim" && Boolean(search.trim());
      setRegexSearch(nextRegexSearch);
      setVimSearchActive(nextRegexSearch);
      setVimSearchQuery(nextRegexSearch ? search : "");
      setFindOpen(Boolean(search.trim() && !nextRegexSearch));
      updateQueryParams({
        eventId: resolvedEventId === "333" ? null : resolvedEventId,
        result: resolvedRankingType === "single" ? null : resolvedRankingType,
        event: null,
        type: null,
        region: regionId || null,
        scope: null,
      });
    };

    syncStateFromUrl();
    window.addEventListener("popstate", syncStateFromUrl);
    return () => window.removeEventListener("popstate", syncStateFromUrl);
  }, []);

  useEffect(() => {
    const pageKey = [
      eventId,
      rankingType,
      regionSelection.scope,
      regionSelection.regionId,
      startRank,
    ].join(":");
    if (initialPageKeyRef.current === pageKey) {
      return;
    }
    initialPageKeyRef.current = "";
    if (skipPageLoadStartRef.current === startRank) {
      skipPageLoadStartRef.current = null;
      return;
    }
    skipPageLoadStartRef.current = null;
    let active = true;
    const requestNavigationEpoch = navigationEpochRef.current;
    const preserveList = preserveListDuringLoadRef.current;
    // This reset is coupled to the request started immediately below.
    setLoading(true);
    if (!preserveList) {
      setEntries([]);
      setNextPageStart(null);
      setPreviousPageStart(null);
      setHasMore(true);
      setTotal(Number.POSITIVE_INFINITY);
    }
    setError("");
    moreRequestRef.current = false;
    previousRequestRef.current = false;
    const focusLast = pendingFocusLastRef.current;
    pendingFocusLastRef.current = false;
    getPage(eventId, rankingType, startRank, regionSelection)
      .then((data) => {
        if (
          !active ||
          requestNavigationEpoch !== navigationEpochRef.current
        )
          return;
        const currentPosition = getCurrentViewportPosition(
          listRef.current,
          entriesRef.current,
          startPositionRef.current,
          startPositionRef.current,
          rowVirtualizerRef.current.getVirtualItems()[0]?.index
        );
        const currentSubRank = getCurrentViewportSubRank(
          listRef.current,
          entriesRef.current,
          startRankRef.current
        );
        const scrollToTop = pendingScrollToTopRef.current;
        const pendingDirection = pendingScrollDirectionRef.current;
        const rankForStep = pendingRankRef.current;
        const appendNavigation =
          pendingNavigationAppendRef.current &&
          !scrollToTop &&
          !focusLast &&
          Boolean(pendingDirection);
        const previousEntries = entriesRef.current;
        const previousStartPosition = startPositionRef.current;
        const previousListHeight = appendNavigation && pendingDirection === -1
          ? rowVirtualizerRef.current.getTotalSize()
          : null;
        const loadedEntries = appendNavigation
          ? pendingDirection === 1
            ? [
                ...previousEntries,
                ...data.entries.filter(
                  (entry) =>
                    !previousEntries.some(
                      (currentEntry) => currentEntry.personId === entry.personId
                    )
                ),
              ]
            : [
                ...data.entries.filter(
                  (entry) =>
                    !previousEntries.some(
                      (currentEntry) => currentEntry.personId === entry.personId
                    )
                ),
                ...previousEntries,
              ]
          : data.entries;
        const loadedStartPosition =
          appendNavigation && pendingDirection === -1
            ? data.startPosition
            : previousStartPosition;
        pendingScrollToTopRef.current = false;
        pendingNavigationAppendRef.current = false;
        setEntries(loadedEntries);
        setStartPosition(
          appendNavigation ? loadedStartPosition : data.startPosition
        );
        if (!appendNavigation || pendingDirection === 1) {
          setNextPageStart(data.nextPageStart);
        }
        if (!appendNavigation || pendingDirection === -1) {
          setPreviousPageStart(data.previousPageStart);
        }
        setLastRank(data.lastRank);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setFetchedAt(data.fetchedAt);
        const requestedTargetIndex = focusLast
          ? Math.max(0, loadedEntries.length - 1)
          : loadedEntries.findIndex(
              (entry) => entry.subRank >= rankForStep
            );
        const targetIndex =
          requestedTargetIndex >= 0
            ? requestedTargetIndex
            : pendingDirection === -1
            ? Math.max(0, loadedEntries.length - 1)
            : 0;
        const shouldScrollToTarget = Boolean(
          scrollToTop ||
            focusLast ||
            pendingDirection ||
            appendNavigation
        );
        pendingScrollDirectionRef.current = null;
        if (scrollToTop) {
          animateScrollTo(
            scrollAnimationStateRef.current,
            0,
            "smooth",
            getScrollAnimationDuration(currentPosition)
          );
        } else if (shouldScrollToTarget) {
          if (previousListHeight !== null) {
            window.requestAnimationFrame(() => {
              const addedHeight = Math.max(
                0,
                rowVirtualizerRef.current.getTotalSize() - previousListHeight
              );
              if (addedHeight > 0)
                window.scrollBy({ top: addedHeight, behavior: "auto" });
            });
          }
          window.requestAnimationFrame(() => {
            scrollToEntry({
              state: scrollAnimationStateRef.current,
              list: listRef.current,
              index: targetIndex,
              alignment: "top",
              requestedBehavior: "smooth",
              requestedDuration: getScrollAnimationDuration(
                Math.abs(rankForStep - currentSubRank)
              ),
              targetOffset: () =>
                rowVirtualizerRef.current.getOffsetForIndex(
                  targetIndex,
                  "start"
                )?.[0],
            });
          });

        }
      })
      .catch((requestError: unknown) => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
        }
      })
      .finally(() => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          setLoading(false);
          preserveListDuringLoadRef.current = false;
          setPreserveListDuringLoad(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    eventId,
    rankingType,
    regionSelection,
    startRank,
  ]);

  const jumpToMatch = useCallback(
    (
      match: RankingEntry,
      direction: -1 | 1 = 1,
      currentMatch: RankingEntry | null = null
    ) => {
      const requestEpoch = navigationEpochRef.current + 1;
      navigationEpochRef.current = requestEpoch;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingSearchLayoutAnchorRef.current = null;
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const activeList = rankingListRef.current;
      const activeTransform = searchTransformOffsetRef.current;
      if (activeList && activeTransform !== 0) {
        activeList.style.transform = "";
        window.scrollBy({ top: -activeTransform, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      const currentMatchViewportTop = (() => {
        if (!currentMatch) return null;
        const mountedRow = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".listItem[data-person-id]"
          )
        ).find(
          (row) => row.dataset.personId === currentMatch.personId
        );
        if (mountedRow) return mountedRow.getBoundingClientRect().top;
        const currentEntryIndex = entriesRef.current.findIndex(
          (entry) => entry.personId === currentMatch.personId
        );
        if (currentEntryIndex < 0) return null;
        const measuredTop =
          rowVirtualizerRef.current.getOffsetForIndex(
            currentEntryIndex,
            "start"
          )?.[0];
        return measuredTop === undefined
          ? null
          : measuredTop - window.scrollY;
      })();
      pendingNavigationAppendRef.current = false;
      pendingRankRef.current = match.subRank;
      navigationTargetRankRef.current = match.subRank;
      pendingScrollDirectionRef.current = direction;
      prefetchSearchResultPages(
        eventId,
        rankingType,
        regionSelection,
        findMatchesRef.current,
        findIndexRef.current
      );
      setError("");
      setLoading(true);
      preserveListDuringLoadRef.current = true;
      setPreserveListDuringLoad(true);
      const finishSearchNavigation = () => {
        if (navigationEpochRef.current !== requestEpoch) return;
        setLoading(false);
        preserveListDuringLoadRef.current = false;
        setPreserveListDuringLoad(false);
      };

      const targetPageStart = pageStartForSubRank(match.subRank);
      const currentSearchSubRank =
        currentMatch?.subRank ??
        getCurrentViewportSubRank(
          listRef.current,
          entriesRef.current,
          startRankRef.current
        );
      const searchPeopleDistance = Math.abs(
        match.subRank - currentSearchSubRank
      );
      const currentPageStart = currentMatch
        ? pageStartForSubRank(currentMatch.subRank)
        : null;
      const jumpMode =
        currentPageStart === null
          ? "local"
          : getSearchJumpMode(
              currentPageStart,
              targetPageStart,
              direction,
              PAGE_SIZE
            );
      const pageRequest =
        jumpMode === "multi-page" && currentPageStart !== null
          ? getDistantSearchWindow(
              eventId,
              rankingType,
              regionSelection,
              currentPageStart,
              match,
              direction
            )
          : getSearchWindow(eventId, rankingType, regionSelection, match);

      void pageRequest
        .then((data) => {
          if (navigationEpochRef.current !== requestEpoch) return;
          const targetIndex = data.entries.findIndex(
            (entry) => entry.personId === match.personId
          );
          if (targetIndex < 0)
            throw new Error("Could not locate the selected ranking result.");

          const currentIndex = currentMatch
            ? data.entries.findIndex(
                (entry) => entry.personId === currentMatch.personId
              )
            : -1;
          const followsRequestedDirection =
            currentMatch !== null &&
            Math.sign(match.subRank - currentMatch.subRank) === direction;
          if (
            currentMatch &&
            currentMatchViewportTop !== null &&
            currentIndex >= 0 &&
            followsRequestedDirection
          ) {
            pendingSearchLayoutAnchorRef.current = {
              requestEpoch,
              personId: currentMatch.personId,
              viewportTop: currentMatchViewportTop,
            };
          }

          const nextSearchStart = data.entries[0]?.subRank ?? 1;
          setHighlightedPersonId(match.personId);
          setEntries(data.entries);
          if (nextSearchStart !== startRankRef.current) {
            skipPageLoadStartRef.current = nextSearchStart;
            setStartRank(nextSearchStart);
          }
          setStartPosition(data.startPosition);
          setNextPageStart(data.nextPageStart);
          setPreviousPageStart(data.previousPageStart);
          setLastRank(data.lastRank);
          setHasMore(data.hasMore);
          setTotal(data.total);
          setFetchedAt(data.fetchedAt);
          pendingScrollDirectionRef.current = null;

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (navigationEpochRef.current !== requestEpoch) return;
              const list = rankingListRef.current;
              if (!list) {
                finishSearchNavigation();
                return;
              }
              const listTop = list.getBoundingClientRect().top + window.scrollY;
              const measuredTargetTop =
                rowVirtualizerRef.current.getOffsetForIndex(
                  targetIndex,
                  "start"
                )?.[0];
              const naturalTargetTop =
                Math.max(
                  0,
                  measuredTargetTop ??
                    listTop + targetIndex * ROW_HEIGHT
              );
              if (currentIndex >= 0 && followsRequestedDirection) {
                const duration = getSearchAnimationDuration(
                  jumpMode,
                  searchPeopleDistance
                );
                animateScrollTo(
                  scrollAnimationStateRef.current,
                  naturalTargetTop,
                  "smooth",
                  duration
                );
                searchAnimationTimerRef.current = window.setTimeout(() => {
                  if (navigationEpochRef.current !== requestEpoch) return;
                  const settledTargetTop =
                    rowVirtualizerRef.current.getOffsetForIndex(
                      targetIndex,
                      "start"
                    )?.[0];
                  if (settledTargetTop !== undefined)
                    window.scrollTo({
                      top: settledTargetTop,
                      behavior: "auto",
                    });
                  searchAnimationTimerRef.current = null;
                  finishSearchNavigation();
                }, duration + SCROLL_SETTLE_DELAY_MS);
                return;
              }

              const transformOffset =
                direction * SEARCH_ANIMATION_ROWS * ROW_HEIGHT;
              const animatedTargetTop = Math.max(
                0,
                naturalTargetTop + transformOffset
              );
              const duration = getSearchAnimationDuration(
                "local",
                searchPeopleDistance
              );
              window.scrollTo({ top: naturalTargetTop, behavior: "auto" });
              list.style.transform = `translateY(${transformOffset}px)`;
              searchTransformOffsetRef.current = transformOffset;
              window.requestAnimationFrame(() => {
                if (navigationEpochRef.current !== requestEpoch) return;
                animateScrollTo(
                  scrollAnimationStateRef.current,
                  animatedTargetTop,
                  "smooth",
                  duration
                );
                searchAnimationTimerRef.current = window.setTimeout(() => {
                  if (navigationEpochRef.current !== requestEpoch) return;
                  list.style.transform = "";
                  searchTransformOffsetRef.current = 0;
                  window.scrollBy({ top: -transformOffset, behavior: "auto" });
                  searchAnimationTimerRef.current = null;
                  finishSearchNavigation();
                }, duration + SCROLL_SETTLE_DELAY_MS);
              });
            });
          });
        })
        .catch((requestError: unknown) => {
          if (navigationEpochRef.current !== requestEpoch) return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
          finishSearchNavigation();
        });
    },
    [eventId, rankingType, regionSelection]
  );

  const cycleFind = useCallback(
    (direction: 1 | -1 = 1) => {
      const matches = findMatchesRef.current;
      if (matches.length === 0) return;
      const currentIndex = findIndexRef.current;
      const currentMatch =
        currentIndex >= 0 ? matches[currentIndex] : null;
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : matches.length - 1
          : (currentIndex + direction + matches.length) % matches.length;
      findIndexRef.current = nextIndex;
      setFindIndex(nextIndex);
      jumpToMatch(matches[nextIndex], direction, currentMatch);
    },
    [jumpToMatch]
  );

  const resetFind = useCallback(() => {
    findMatchesRef.current = [];
    findIndexRef.current = -1;
    setSearchQueryParam("");
    updateQueryParams({ mode: null });
    setFindQuery("");
    setRegexSearch(false);
    setVimSearchActive(false);
    setVimSearchQuery("");
    setFindMatches([]);
    setFindIndex(-1);
    setFindLoading(false);
    setFindResolvedQuery("");
    setFindError("");
    setHighlightedPersonId("");
    pendingScrollDirectionRef.current = null;
  }, []);

  const cancelVimSearch = useCallback(() => {
    resetFind();
    setFindOpen(false);
    setVimMode(false);
    setVimHelpOpen(false);
    setVimCommand(":");
  }, [resetFind]);

  useEffect(() => {
    const normalizedQuery = findQuery.trim();
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => {
        if (controller.signal.aborted) return;
        if (
          initialSearchRef.current &&
          normalizedQuery === normalizedInitialSearch
        ) {
          initialSearchRef.current = false;
          setFindLoading(false);
          return;
        }
        findMatchesRef.current = [];
        findIndexRef.current = -1;
        setFindMatches([]);
        setFindIndex(-1);
        setFindError("");
        setHighlightedPersonId("");

        if (!normalizedQuery) {
          setFindResolvedQuery("");
          setFindLoading(false);
          return;
        }

        setFindLoading(true);
        searchRankings(
          eventId,
          rankingType,
          regionSelection,
          normalizedQuery,
          regexSearch,
          controller.signal
        )
          .then((data) => {
            if (controller.signal.aborted) return;
            setFindResolvedQuery(normalizedQuery);
            const orderedMatches = orderSearchMatches(data.entries);
            findMatchesRef.current = orderedMatches;
            setFindMatches(orderedMatches);
            if (orderedMatches.length > 0) {
              findIndexRef.current = 0;
              setFindIndex(0);
              jumpToMatch(data.entries[0]);
            }
          })
          .catch((requestError: unknown) => {
            if (!controller.signal.aborted) {
              setFindResolvedQuery(normalizedQuery);
              setFindError(
                requestError instanceof Error
                  ? requestError.message
                  : "Search is unavailable."
              );
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setFindLoading(false);
          });
      },
      normalizedQuery ? 800 : 0
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    eventId,
    findQuery,
    normalizedInitialSearch,
    rankingType,
    regionSelection,
    regexSearch,
    jumpToMatch,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        if (vimMode) {
          setVimMode(false);
          setVimCommand(":");
        }
        if (vimSearchActive || regexSearch) resetFind();
        setVimSearchActive(false);
        setVimSearchQuery("");
        setRegexSearch(false);
        updateQueryParams({ mode: null });
        setFindOpen(true);
        window.requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
        return;
      }
      if (vimMode) return;
      if (vimSearchActive && key === "n" && !isEditable) {
        event.preventDefault();
        setFindOpen(false);
        cycleFind();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "g") {
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        if (vimSearchActive) {
          setFindOpen(false);
          if (findQuery.trim()) cycleFind(direction);
        } else {
          setFindOpen(true);
          if (findQuery.trim()) cycleFind(direction);
          else resetFind();
        }
        return;
      }
      if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        setFindOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cycleFind,
    findOpen,
    findQuery,
    regexSearch,
    resetFind,
    vimMode,
    vimSearchActive,
  ]);

  useEffect(() => {
    if (!findOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!findBarRef.current?.contains(event.target as Node))
        setFindOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [findOpen]);

  const loadMore = useCallback(async () => {
    if (
      !nextPageStart ||
      !hasMore ||
      moreRequestRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollAnimationStateRef.current.programmatic
    )
      return;
    const requestEpoch = navigationEpochRef.current;
    moreRequestRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getPage(
        eventId,
        rankingType,
        nextPageStart,
        regionSelection
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        preserveListDuringLoadRef.current ||
        scrollAnimationStateRef.current.programmatic
      )
        return;
      setEntries((current) => [
        ...current,
        ...data.entries.filter(
          (entry) => !current.some((item) => item.personId === entry.personId)
        ),
      ]);
      setNextPageStart(data.nextPageStart);
      setHasMore(data.hasMore);
      setLastRank(data.lastRank);
      setTotal(data.total);
      setFetchedAt(data.fetchedAt);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load more rankings."
      );
    } finally {
      moreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [eventId, hasMore, loading, nextPageStart, rankingType, regionSelection]);

  const loadPrevious = useCallback(async () => {
    if (
      !previousPageStart ||
      previousRequestRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollAnimationStateRef.current.programmatic
    )
      return;
    const requestEpoch = navigationEpochRef.current;
    previousRequestRef.current = true;
    setLoadingPrevious(true);
    const previousListHeight = rowVirtualizer.getTotalSize();
    try {
      const data = await getPage(
        eventId,
        rankingType,
        previousPageStart,
        regionSelection
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        preserveListDuringLoadRef.current ||
        scrollAnimationStateRef.current.programmatic
      )
        return;
      const newEntries = data.entries.filter(
        (entry) =>
          !entriesRef.current.some((item) => item.personId === entry.personId)
      );
      setEntries((current) => [...newEntries, ...current]);
      setStartPosition(data.startPosition);
      setPreviousPageStart(data.previousPageStart);
      setLastRank(data.lastRank);
      setFetchedAt(data.fetchedAt);
      window.requestAnimationFrame(() => {
        const addedHeight = Math.max(
          0,
          rowVirtualizer.getTotalSize() - previousListHeight
        );
        if (addedHeight > 0)
          window.scrollBy({ top: addedHeight, behavior: "auto" });
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load earlier rankings."
      );
    } finally {
      previousRequestRef.current = false;
      setLoadingPrevious(false);
    }
  }, [
    eventId,
    loading,
    previousPageStart,
    rankingType,
    regionSelection,
    rowVirtualizer,
  ]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    // Loading the next bucket is the synchronization performed by this effect.
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - 12) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadMore();
    }
  }, [entries.length, loadMore, virtualRows]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      if (
        !scrollAnimationStateRef.current.programmatic &&
        window.scrollY < lastScrollY
      ) {
        navigationTargetRankRef.current = null;
        if (window.scrollY <= listOffset + ROW_HEIGHT * 14) void loadPrevious();
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listOffset, loadPrevious]);

  useEffect(() => {
    const cancelOnUserInput = () => {
      if (
        !scrollAnimationStateRef.current.active &&
        !scrollAnimationStateRef.current.programmatic &&
        !preserveListDuringLoadRef.current
      )
        return;
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingSearchLayoutAnchorRef.current = null;
      navigationTargetRankRef.current = null;
      pendingNavigationAppendRef.current = false;
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const list = rankingListRef.current;
      const transformOffset = searchTransformOffsetRef.current;
      if (list && transformOffset !== 0) {
        list.style.transform = "";
        window.scrollBy({ top: -transformOffset, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      setLoading(false);
      preserveListDuringLoadRef.current = false;
      setPreserveListDuringLoad(false);
    };
    window.addEventListener("wheel", cancelOnUserInput, { passive: true });
    window.addEventListener("touchstart", cancelOnUserInput, { passive: true });
    window.addEventListener("pointerdown", cancelOnUserInput, {
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", cancelOnUserInput);
      window.removeEventListener("touchstart", cancelOnUserInput);
      window.removeEventListener("pointerdown", cancelOnUserInput);
    };
  }, []);

  useEffect(() => {
    const animationState = scrollAnimationStateRef.current;
    return () => {
      cancelScrollAnimation(animationState);
      if (searchAnimationTimerRef.current !== null)
        window.clearTimeout(searchAnimationTimerRef.current);
    };
  }, []);

  const visibleSubRank =
    entries[virtualRows[0]?.index ?? 0]?.subRank ?? startRank;
  const renderedRows = hydrated
    ? virtualRows
    : entries.map((_, index) => ({
        index,
        start: index * ROW_HEIGHT,
        key: index,
      }));
  const getRenderedEntry = (index: number): RankingEntry | null =>
    entries[index] ?? null;
  const renderedListHeight = hydrated
    ? rowVirtualizer.getTotalSize()
    : entries.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);

  const resetToRank = useCallback(
    (rank: number) => {
      // Vim and jump controls pass the internal sub_rank, never the displayed rank.
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingNavigationAppendRef.current = false;
      setLoading(false);
      const maximumRank = lastRank ?? (Number.isFinite(total) ? total : rank);
      const normalizedRank = Math.max(1, Math.min(rank, maximumRank));
      const currentRank = getCurrentViewportSubRank(
        listRef.current,
        entriesRef.current,
        startRankRef.current
      );
      const currentPosition = getCurrentViewportPosition(
        listRef.current,
        entriesRef.current,
        startPositionRef.current,
        startPositionRef.current,
        rowVirtualizer.getVirtualItems()[0]?.index
      );
      navigationTargetRankRef.current = normalizedRank;
      pendingRankRef.current = normalizedRank;
      if (normalizedRank === 1) {
        resetFind();
        pendingFocusLastRef.current = false;
        pendingScrollDirectionRef.current = null;
        pendingScrollToTopRef.current = true;
        cancelScrollAnimation(scrollAnimationStateRef.current);
        if (startRank === 1) {
          pendingScrollToTopRef.current = false;
          animateScrollTo(
            scrollAnimationStateRef.current,
            0,
            "smooth",
            getScrollAnimationDuration(currentPosition)
          );
        } else {
          preserveListDuringLoadRef.current = true;
          setPreserveListDuringLoad(true);
          setStartRank(1);
        }
        return;
      }
      pendingScrollToTopRef.current = false;
      pendingFocusLastRef.current = false;
      pendingScrollDirectionRef.current =
        normalizedRank < currentRank
          ? -1
          : normalizedRank > currentRank
          ? 1
          : null;
      // Rank values can be missing, so ask the API for the exact target and let
      // its ordered query choose the first real result at or beyond that rank.
      pendingNavigationAppendRef.current = Boolean(
        pendingScrollDirectionRef.current
      );
      const nextStart = pageStartForSubRank(normalizedRank) + 1;
      const firstLoadedRank = entries[0]?.subRank ?? Number.POSITIVE_INFINITY;
      const lastLoadedRank = entries.at(-1)?.subRank ?? 0;
      if (
        normalizedRank >= firstLoadedRank &&
        normalizedRank <= lastLoadedRank
      ) {
        const requestedTargetIndex = entries.findIndex(
          (entry) => entry.subRank >= normalizedRank
        );
        const targetIndex =
          requestedTargetIndex >= 0
            ? requestedTargetIndex
            : pendingScrollDirectionRef.current === -1
            ? 0
            : Math.max(0, entries.length - 1);
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "top",
          requestedBehavior: "smooth",
          requestedDuration: getScrollAnimationDuration(
            Math.abs(normalizedRank - currentRank)
          ),
          targetOffset: () =>
            rowVirtualizer.getOffsetForIndex(targetIndex, "start")?.[0],
        });
        pendingScrollDirectionRef.current = null;
        return;
      }
      preserveListDuringLoadRef.current = true;
      setPreserveListDuringLoad(true);
      setStartRank(nextStart);
    },
    [
      entries,
      lastRank,
      resetFind,
      rowVirtualizer,
      startRank,
      total,
    ]
  );

  const jumpToEnd = useCallback(() => {
    navigationEpochRef.current += 1;
    cancelScrollAnimation(scrollAnimationStateRef.current);
    pendingNavigationAppendRef.current = false;
    setLoading(false);
    const endRank = lastRank ?? (Number.isFinite(total) ? total : visibleSubRank);
    const nextStart = pageStartForSubRank(endRank) + 1;
    const currentRank = getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
    navigationTargetRankRef.current = endRank;
    pendingRankRef.current = endRank;
    pendingScrollToTopRef.current = false;
    pendingFocusLastRef.current = true;
    pendingScrollDirectionRef.current =
      endRank < currentRank ? -1 : endRank > currentRank ? 1 : null;
    if (!hasMore && entries.length > 0) {
      const targetIndex = Math.max(0, entries.length - 1);
      scrollToEntry({
        state: scrollAnimationStateRef.current,
        list: listRef.current,
        index: targetIndex,
        alignment: "top",
        requestedBehavior: "smooth",
        requestedDuration: getScrollAnimationDuration(
          Math.abs(endRank - currentRank)
        ),
        targetOffset: () =>
          rowVirtualizer.getOffsetForIndex(targetIndex, "start")?.[0],
      });
      pendingScrollDirectionRef.current = null;
      pendingFocusLastRef.current = false;
      return;
    }
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setStartRank(nextStart);
  }, [
    entries.length,
    hasMore,
    lastRank,
    rowVirtualizer,
    total,
    visibleSubRank,
  ]);

  const getNavigationBaseSubRank = useCallback(() => {
    const navigationInProgress =
      scrollAnimationStateRef.current.active ||
      scrollAnimationStateRef.current.programmatic ||
      preserveListDuringLoadRef.current;
    if (navigationInProgress && navigationTargetRankRef.current !== null)
      return navigationTargetRankRef.current;
    return getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
  }, []);

  const handleJumpUp = () => {
    if (visibleSubRank <= 5000) {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
      resetToRank(1);
      return;
    }
    if (jumpUpArmedRef.current) {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
      resetToRank(1);
      return;
    }
    jumpDownArmedRef.current = false;
    setJumpDownArmed(false);
    if (jumpDownTimerRef.current !== null)
      window.clearTimeout(jumpDownTimerRef.current);
    jumpDownTimerRef.current = null;
    jumpUpArmedRef.current = true;
    jumpUpTimerRef.current = window.setTimeout(() => {
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
    }, 500);
    setJumpUpArmed(true);
    resetToRank(getNavigationBaseSubRank() - 5000);
  };

  const handleJumpDown = () => {
    if (Number.isFinite(total) && visibleSubRank >= total - 5000) {
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
      jumpToEnd();
      return;
    }
    if (jumpDownArmedRef.current) {
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
      jumpToEnd();
      return;
    }
    jumpUpArmedRef.current = false;
    setJumpUpArmed(false);
    if (jumpUpTimerRef.current !== null)
      window.clearTimeout(jumpUpTimerRef.current);
    jumpUpTimerRef.current = null;
    jumpDownArmedRef.current = true;
    jumpDownTimerRef.current = window.setTimeout(() => {
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
    }, 500);
    setJumpDownArmed(true);
    resetToRank(getNavigationBaseSubRank() + 5000);
  };

  useEffect(
    () => () => {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpUpArmedRef.current = false;
      jumpDownArmedRef.current = false;
    },
    []
  );

  const resetToRankRef = useRef(resetToRank);
  const jumpToEndRef = useRef(jumpToEnd);
  useEffect(() => {
    resetToRankRef.current = resetToRank;
    jumpToEndRef.current = jumpToEnd;
  }, [jumpToEnd, resetToRank]);

  const executeVimCommand = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim();
      const lowerCommand = command.toLocaleLowerCase();
      const currentRank = getNavigationBaseSubRank();

      if (command === "G" || command === "$" || lowerCommand === "end") {
        jumpToEndRef.current();
      } else if (command === "gg" || lowerCommand === "top") {
        resetToRankRef.current(1);
      } else if (
        command === "j" ||
        command === "d" ||
        lowerCommand === "down" ||
        lowerCommand === "pagedown"
      ) {
        resetToRankRef.current(currentRank + VIM_JUMP_SIZE);
      } else if (
        command === "k" ||
        command === "u" ||
        lowerCommand === "up" ||
        lowerCommand === "pageup"
      ) {
        resetToRankRef.current(currentRank - VIM_JUMP_SIZE);
      } else if (/^[+-]\d+$/.test(command)) {
        resetToRankRef.current(currentRank + Number(command));
      } else if (/^\d[\d,]*$/.test(command)) {
        resetToRankRef.current(Number(command.replaceAll(",", "")));
      }
    },
    [getNavigationBaseSubRank]
  );

  useEffect(() => {
    const onVimKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if (event.key === "Escape" && (vimMode || vimSearchActive)) {
        event.preventDefault();
        cancelVimSearch();
        return;
      }

      if (!vimMode) {
        const directVimCommand = event.key.toLocaleLowerCase();
        if (
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ["j", "k", "d", "u"].includes(directVimCommand)
        ) {
          event.preventDefault();
          executeVimCommand(directVimCommand);
          return;
        }
        if (
          (event.key === ":" || event.key === "/") &&
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          setVimMode(true);
          setVimHelpOpen(false);
          setFindOpen(false);
          if (event.key === "/" && !vimSearchActive) resetFind();
          setVimCommand(
            event.key === "/" && vimSearchActive
              ? `/${vimSearchQuery}`
              : event.key
          );
        }
        return;
      }

      const editingVimSearch =
        isEditable && vimCommand.startsWith("/");
      if (editingVimSearch && event.key !== "Enter" && event.key !== "Escape") {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.key.length !== 1 &&
        !["Enter", "Escape", "Backspace"].includes(event.key)
      )
        return;

      event.preventDefault();
      if (vimCommand.startsWith("/")) {
        if (event.key === "Enter") {
          const regexQuery = vimCommand.slice(1).trim();
          if (regexQuery) {
            setRegexSearch(true);
            updateQueryParams({ search: regexQuery, mode: "vim" });
            setFindResolvedQuery("");
            setFindQuery(regexQuery);
            setVimSearchActive(true);
            setVimSearchQuery(regexQuery);
            setFindOpen(false);
            vimInputRef.current?.blur();
          }
          setVimMode(false);
          setVimCommand(":");
        } else if (event.key === "Backspace") {
          setVimCommand((current) => current.length > 1 ? current.slice(0, -1) : current);
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          setVimCommand((current) => current + event.key);
        }
        return;
      }
      const directVimCommand =
        event.key === "G" ? "G" : event.key.toLocaleLowerCase();
      if (
        vimCommand === ":" &&
        ["j", "k", "d", "u", "G"].includes(directVimCommand)
      ) {
        executeVimCommand(directVimCommand);
        setVimCommand(":");
        return;
      }
      if (vimCommand === ":g" && event.key === "g") {
        executeVimCommand("gg");
        setVimCommand(":");
        return;
      }
      if (event.key === "Escape") {
        setVimMode(false);
        setVimHelpOpen(false);
        setVimCommand(":");
      } else if (event.key === "Enter") {
        executeVimCommand(vimCommand.slice(1));
        setVimMode(false);
        setVimCommand(":");
      } else if (event.key === "Backspace") {
        setVimCommand((current) =>
          current.length > 1 ? current.slice(0, -1) : current
        );
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        setVimCommand((current) => current + event.key);
      }
    };

    window.addEventListener("keydown", onVimKeyDown);
    return () => window.removeEventListener("keydown", onVimKeyDown);
  }, [
    cancelVimSearch,
    executeVimCommand,
    resetFind,
    vimCommand,
    vimMode,
    vimSearchActive,
    vimSearchQuery,
  ]);

  useEffect(() => {
    vimCommandRef.current = vimCommand;
  }, [vimCommand]);

  useEffect(() => {
    if (!vimMode || !vimCommandRef.current.startsWith("/")) return;
    window.requestAnimationFrame(() => {
      vimInputRef.current?.focus();
      const end = vimInputRef.current?.value.length ?? 0;
      vimInputRef.current?.setSelectionRange(end, end);
    });
  }, [vimMode]);

  const changeRankingType = (nextRankingType: "single" | "average") => {
    if (
      nextRankingType === rankingType ||
      (eventId === "333mbf" && nextRankingType === "average")
    )
      return;
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    pendingScrollDirectionRef.current = null;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setRankingType(nextRankingType);
    updateQueryParams({
      result: nextRankingType === "single" ? null : nextRankingType,
      type: null,
    });
    setStartRank(1);
  };

  const changeEvent = (nextEventId: (typeof WCA_EVENTS)[number]["id"]) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setStartRank(1);
    setEventId(nextEventId);
    const nextRankingType = nextEventId === "333mbf" ? "single" : rankingType;
    setRankingType(nextRankingType);
    updateQueryParams({
      eventId: nextEventId === "333" ? null : nextEventId,
      result: nextRankingType === "single" ? null : nextRankingType,
      event: null,
      type: null,
    });
  };

  const changeRegion = (option: RegionOption) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setStartRank(1);
    setRegionSelection({ scope: option.scope, regionId: option.regionId });
    updateQueryParams({
      region: option.scope === "world" ? null : option.regionId,
      scope: null,
    });
  };

  const openFind = () => {
    if (vimMode || vimSearchActive || regexSearch) resetFind();
    setVimSearchActive(false);
    setVimSearchQuery("");
    setRegexSearch(false);
    updateQueryParams({ mode: null });
    setFindOpen(true);
    window.requestAnimationFrame(() => findInputRef.current?.focus());
  };

  const findPending =
    Boolean(findQuery.trim()) && findQuery.trim() !== findResolvedQuery;
  const searchMatchPersonIds = useMemo(
    () =>
      new Set(
        findResolvedQuery
          ? findMatches.map((match) => match.personId)
          : []
      ),
    [findMatches, findResolvedQuery]
  );
  const vimInputValue = vimMode ? vimCommand : `/${vimSearchQuery}`;

  return (
    <div
      className={`app${vimMode || vimSearchActive ? " app--vimMode" : ""}${
        findQuery.trim() ? " app--searching" : ""
      }`}
    >
      {debugScrollY > 100 && (
        <div className="debugScrollY" aria-hidden="true">
          scrollY: {Math.round(debugScrollY)}
        </div>
      )}
      <header className="header" ref={headerRef}>
        <div className="headerTitle">
          <h1 className="title">
            <Link href="/">WCA Rankings</Link>
          </h1>
          {findOpen ? (
            <div
              ref={findBarRef}
              className={`findBar${findFloating ? " findBar--floating" : ""}`}
              role="search"
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                )
                  setFindOpen(false);
              }}
            >
              <span className="findIcon" aria-hidden="true">
                <SearchIcon />
              </span>
              <input
                ref={findInputRef}
                className="findInput"
                type="search"
                value={findQuery}
                onChange={(event) => {
                  setVimSearchActive(false);
                  setVimSearchQuery("");
                  setRegexSearch(false);
                  setFindResolvedQuery("");
                  updateQueryParams({ search: event.target.value.trim() ? event.target.value : null, mode: null });
                  setFindQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    cycleFind(event.shiftKey ? -1 : 1);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setFindOpen(false);
                  }
                }}
                aria-label="Find a name or WCA ID"
              />
              <span
                className={`findStatus${findError ? " isError" : ""}`}
                aria-live="polite"
              >
                {findError ||
                  (findLoading || findPending
                    ? "Searching…"
                    : findQuery.trim()
                    ? findMatches.length
                      ? `${findIndex + 1} of ${findMatches.length}`
                      : "No matches"
                    : "")}
              </span>
              <button
                className="findClose"
                type="button"
                onClick={() => setFindOpen(false)}
                aria-label="Close search"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              className={`searchButton${
                findFloating ? " searchButton--floating" : ""
              }`}
              type="button"
              onClick={openFind}
              aria-label="Search names or WCA IDs"
              title="Search names or WCA IDs (Ctrl+F)"
            >
              <SearchIcon />
            </button>
          )}
        </div>
        <div className="chooser">
          <div className="selectInput eventInput">
            <select
              name="Event Id"
              onChange={(event) =>
                changeEvent(
                  event.target.value as (typeof WCA_EVENTS)[number]["id"]
                )
              }
              value={eventId}
            >
              {WCA_EVENTS.map(({ id, shortName }) => (
                <option key={id} value={id}>
                  {shortName}
                </option>
              ))}
            </select>
            <SelectArrow />
          </div>
          <fieldset className="rankingTypeToggle" aria-label="Ranking type">
            <legend className="visuallyHidden">Ranking type</legend>
            {(["single", "average"] as const).map((option) => (
              <label
                className={`rankingTypeOption${
                  rankingType === option ? " isSelected" : ""
                }${
                  option === "average" && eventId === "333mbf"
                    ? " isDisabled"
                    : ""
                }`}
                key={option}
              >
                <input
                  type="radio"
                  name="Ranking type"
                  value={option}
                  checked={rankingType === option}
                  disabled={option === "average" && eventId === "333mbf"}
                  onChange={() => changeRankingType(option)}
                />
                <span>{option === "single" ? "Single" : "Average"}</span>
              </label>
            ))}
          </fieldset>
          {regions.length > 0 && (
            <RegionPicker
              options={regions}
              selected={regionSelection}
              onChange={changeRegion}
            />
          )}
        </div>
      </header>

      <main>
        <div
          className={`Jump Jump--up${
          visibleSubRank > 1 || jumpUpArmed ? " visible" : ""
          }`}
        >
          <button className="Jump-button" onClick={handleJumpUp}>
            <Arrow direction="up" />
            <span>
              {jumpUpArmed
                ? "Jump to top"
                : visibleSubRank <= 5000
                ? "Jump to top"
                : `Jump ${formatRankingNumber(5000)}`}
            </span>
            <Arrow direction="up" />
          </button>
        </div>

        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {loadingPrevious && (
              <div className="listMessage">Loading earlier rankings…</div>
            )}
            {error ? (
              <div className="listMessage">{error}</div>
            ) : loading && !preserveListDuringLoad ? (
              <ol className="list loadingList">
                {Array.from({ length: 10 }, (_, index) => (
                  <RankingRow
                    key={index}
                    entry={null}
                    eventId={eventId}
                    rankingType={rankingType}
                    loading
                    animationIndex={index}
                  />
                ))}
              </ol>
            ) : (
              <ol
                ref={rankingListRef}
                className="list"
                style={{ height: `${renderedListHeight}px` }}
              >
                    {renderedRows.map((virtualRow) => {
                      const entry = getRenderedEntry(virtualRow.index);
                      const previousEntry = getRenderedEntry(
                        virtualRow.index - 1
                      );
                      return (
                    <div
                      ref={rowVirtualizer.measureElement}
                      className="virtualRow"
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      style={{
                        transform: `translateY(${
                          virtualRow.start - listOffset
                        }px)`,
                      }}
                    >
                          {entry ? (
                            <RankingRow
                              entry={entry}
                          eventId={eventId}
                          rankingType={rankingType}
                          loading={false}
                          animationIndex={virtualRow.index}
                          searchMatched={searchMatchPersonIds.has(
                            entry.personId
                          )}
                          highlighted={entry.personId === highlightedPersonId}
                          rankIsDuplicate={isDuplicateRank(
                            previousEntry?.rank,
                            entry.rank
                          )}
                        />
                      ) : (
                        <div className="listMessage">
                          {loadingMore
                            ? "Loading more results…"
                            : "Keep scrolling…"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div
          className={`Jump Jump--down${
            jumpDownArmed || (Number.isFinite(total) && visibleSubRank < total)
              ? " visible"
              : ""
          }`}
        >
          <button className="Jump-button" onClick={handleJumpDown}>
            <Arrow direction="down" />
            <span>
              {jumpDownArmed
                ? "Jump to end"
                : Number.isFinite(total) && visibleSubRank >= total - 5000
                ? "Jump to end"
                : `Jump ${formatRankingNumber(5000)}`}
            </span>
            <Arrow direction="down" />
          </button>
        </div>
      </main>
      {(vimMode || vimSearchActive) && (
        <div className="vimCommandLine" role="status" aria-label="Vim command">
          <div className="vimCommandText">
            <input
              ref={vimInputRef}
              className="vimInput"
              type="text"
              value={vimInputValue}
              readOnly={!vimMode}
              aria-label={vimSearchActive && !vimMode ? "Vim regex search" : "Vim command"}
              onChange={(event) => {
                if (vimMode) setVimCommand(event.target.value);
              }}
              onFocus={(event) => {
                if (!vimMode) event.currentTarget.blur();
              }}
              onKeyDown={(event) => {
                if (
                  vimSearchActive &&
                  !vimMode &&
                  (event.ctrlKey || event.metaKey) &&
                  event.key.toLocaleLowerCase() === "g"
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setFindOpen(false);
                  cycleFind(event.shiftKey ? -1 : 1);
                  return;
                }
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey
                ) {
                  event.stopPropagation();
                }
              }}
            />
          </div>
          {vimSearchActive && (
            <span className="vimMatchStatus" aria-live="polite">
              {findLoading || findPending
                ? "Searching…"
                : findQuery.trim()
                ? findMatches.length
                  ? `${findIndex + 1} of ${findMatches.length}`
                  : "0 of 0"
                : ""}
            </span>
          )}
          <button
            className="vimHelpButton"
            type="button"
            aria-label="Show Vim keybindings"
            aria-expanded={vimHelpOpen}
            aria-controls="vim-help-popup"
            onClick={() => setVimHelpOpen((open) => !open)}
          >
            ?
          </button>
        </div>
      )}
      {(vimMode || vimSearchActive) && vimHelpOpen && (
        <div
          className="vimHelpPopup"
          id="vim-help-popup"
          role="dialog"
          aria-label="Vim keybindings"
        >
          <div className="vimHelpHeader">
            <strong>Vim bindings</strong>
            <button
              className="vimHelpClose"
              type="button"
              aria-label="Close Vim keybindings"
              onClick={() => setVimHelpOpen(false)}
            >
              ×
            </button>
          </div>
          <dl>
            <dt>j / d</dt>
                <dd>Scroll down 100 people</dd>
            <dt>k / u</dt>
                <dd>Scroll up 100 people</dd>
            <dt>gg</dt>
            <dd>Jump to the top</dd>
            <dt>G</dt>
            <dd>Jump to the end</dd>
            <dt>:5000</dt>
            <dd>Jump to a specific rank</dd>
              <dt>:+500</dt>
              <dd>Jump relative to the current rank</dd>
            <dt>/pattern</dt>
            <dd>Search names and WCA IDs with regex</dd>
            <dt>Ctrl+G</dt>
            <dd>Next search result</dd>
            <dt>Ctrl+Shift+G</dt>
            <dd>Previous search result</dd>
          </dl>
        </div>
      )}
      <footer className="siteFooter">
        <span>By Adam Walker and Cailyn Sinclair</span>
        <span>
          {fetchedAt
            ? `fetched ${formatFetchedAgo(fetchedAt)}`
            : "fetched time unavailable"}
        </span>
      </footer>
    </div>
  );
}
