"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  formatWcaResult,
  type RegionScope,
} from "@/lib/wca";

const EVENTS_MAP = {
  "333": "3x3",
  "222": "2x2",
  "444": "4x4",
  "555": "5x5",
  "666": "6x6",
  "777": "7x7",
  "333bf": "3x3 Blindfolded",
  "333oh": "3x3 One-handed",
  clock: "Clock",
  minx: "Megaminx",
  pyram: "Pyraminx",
  skewb: "Skewb",
  sq1: "Square-1",
} as const;

const PAGE_SIZE = 100;
const ROW_HEIGHT = 61.6;
const VISIBLE_AFTER_NUM_ENTRIES = 40;
const SCROLL_ANIMATION_DURATION_MS = 1600;
const rankingNumberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
let scrollAnimationFrame: number | null = null;
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function formatRankingNumber(value: number) {
  return rankingNumberFormatter.format(value);
}

function formatFetchedAgo(value: string) {
  const fetchedAt = new Date(value).getTime();
  if (!Number.isFinite(fetchedAt)) return "time unavailable";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

function setSearchQueryParam(value: string) {
  const url = new URL(window.location.href);
  if (value.trim()) url.searchParams.set("search", value);
  else url.searchParams.delete("search");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

type RankingEntry = {
  rank: number;
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
  total: number;
  fetchedAt: string | null;
  exportDate?: string | null;
};

type InitialRankingData = Pick<RankingPage, "entries" | "hasMore" | "nextPageStart" | "previousPageStart" | "total" | "fetchedAt"> & {
  startRank: number;
  searchMatches: RankingEntry[];
  initialMatchPersonId: string;
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

function pageStartForRank(rank: number) {
  return Math.floor((Math.max(1, rank) - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
}

function getPage(
  eventId: string,
  rankingType: "single" | "average",
  start: number,
  selection: RegionSelection,
) {
  const pageStart = pageStartForRank(start);
  const params = new URLSearchParams({
    event: eventId,
    type: rankingType,
    scope: selection.scope,
    region: selection.regionId,
    start: String(pageStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  const cacheKey = params.toString();
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  const request = fetch(`/api/rankings?${params}`).then(async (response) => {
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new Error(body.error ?? "Rankings are unavailable.");
    }
    const data = await response.json() as RankingPage;
    return {
      entries: data.entries,
      hasMore: data.hasMore,
      nextPageStart: data.nextPageStart,
      previousPageStart: data.previousPageStart,
      total: data.total,
      fetchedAt: data.fetchedAt ?? data.exportDate ?? null,
    };
  });

  pageCache.set(cacheKey, request);
  request.catch(() => pageCache.delete(cacheKey));
  return request;
}

function searchRankings(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  search: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    event: eventId,
    type: rankingType,
    scope: selection.scope,
    region: selection.regionId,
    search,
    searchLimit: "500",
  });

  return fetch(`/api/rankings?${params}`, { signal }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new Error(body.error ?? "Search is unavailable.");
    }
    return response.json() as Promise<{ entries: RankingEntry[] }>;
  });
}

function cancelScrollAnimation() {
  if (scrollAnimationFrame === null) return;
  window.cancelAnimationFrame(scrollAnimationFrame);
  scrollAnimationFrame = null;
}

function animateScrollTo(targetTop: number, requestedBehavior: ScrollBehavior) {
  cancelScrollAnimation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (requestedBehavior !== "smooth" || reducedMotion) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
    return;
  }

  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  if (Math.abs(distance) < 1) return;
  const startedAt = performance.now();
  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / SCROLL_ANIMATION_DURATION_MS);
    const easedProgress = 1 - (1 - progress) ** 3;
    window.scrollTo({ top: startTop + distance * easedProgress, behavior: "auto" });
    if (progress < 1) scrollAnimationFrame = window.requestAnimationFrame(animate);
    else scrollAnimationFrame = null;
  };
  scrollAnimationFrame = window.requestAnimationFrame(animate);
}

function scrollToEntry(
  list: HTMLDivElement | null,
  index: number,
  alignment: "top" | "center" = "top",
  requestedBehavior: ScrollBehavior = "smooth",
  requestedDirection: -1 | 1 | null = null,
  schedule = true,
) {
  const scroll = () => {
    const listTop = list?.getBoundingClientRect().top ?? 0;
    const viewportOffset = alignment === "center" ? Math.max(0, (window.innerHeight - ROW_HEIGHT) / 2) : 0;
    const targetTop = Math.max(0, listTop + window.scrollY + Math.max(0, index) * ROW_HEIGHT - viewportOffset);
    const distance = Math.abs(targetTop - window.scrollY);
    const direction = requestedDirection ?? (targetTop < window.scrollY ? -1 : 1);
    animateScrollTo(Math.max(0, window.scrollY + direction * distance), requestedBehavior);
  };
  if (schedule) {
    cancelScrollAnimation();
    scrollAnimationFrame = window.requestAnimationFrame(() => {
      scrollAnimationFrame = null;
      scroll();
    });
  }
  else scroll();
}

function getCurrentViewportRank(
  list: HTMLDivElement | null,
  entries: RankingEntry[],
  fallbackRank: number,
) {
  if (!list || entries.length === 0) return fallbackRank;
  const listTop = list.getBoundingClientRect().top;
  const index = Math.max(0, Math.min(entries.length - 1, Math.floor(-listTop / ROW_HEIGHT)));
  return entries[index]?.rank ?? fallbackRank;
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
        d={direction === "up"
          ? "M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z"
          : "M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z"}
      />
    </svg>
  );
}

function SelectArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 10L12 15L17 10" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="10.75" cy="10.75" r="5.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M15 15L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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
  const selectedOption = options.find(
    (option) => option.scope === selected.scope && option.regionId === selected.regionId,
  ) ?? options[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options;
  const continents = filteredOptions.filter((option) => option.scope === "continent");
  const countries = filteredOptions.filter((option) => option.scope === "country");

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const choose = (option: RegionOption) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const renderOption = (option: RegionOption) => (
    <button
      className={`regionOption${selectedOption?.key === option.key ? " isSelected" : ""}`}
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
              {continents.length > 0 && <div className="regionGroupLabel">Continents</div>}
              {continents.map(renderOption)}
              {countries.length > 0 && <div className="regionGroupLabel">Countries</div>}
              {countries.map(renderOption)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RankingRow({ entry, eventId, loading, animationIndex, highlighted = false }: { entry: RankingEntry | null; eventId: string; loading: boolean; animationIndex: number; highlighted?: boolean }) {
  const style = { "--t-animation-delay": `${animationIndex * 10}ms` } as React.CSSProperties;
  const rank = entry?.rank ?? 0;
  const name = entry?.personName ?? "";
  const id = entry?.personId ?? "";

  return (
    <li className={`listItem${loading || !entry ? " isLoading" : ""}`} style={style}>
      <div className="loader" aria-hidden="true">
        <div className="rank loaderBlob" />
        <div className="name loaderBlob" />
        <div className="best loaderBlob" />
      </div>
      <div className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}${highlighted ? " row--searchMatch" : ""}`}>
        <span className="rank">{formatRankingNumber(rank)}</span>
        <span className="identity">
          <span className="name">{name}</span>
          <span className="wcaId">{id}</span>
        </span>
        <span className="result">
          <span className="best">{entry ? formatWcaResult(eventId, entry.best) : ""}</span>
          {entry?.competitionName && <span className="competitionName" title={entry.competitionName}>{entry.competitionName}</span>}
        </span>
      </div>
    </li>
  );
}

export function RankingsExplorer({
  initialData,
  initialSearch = "",
}: {
  initialData?: InitialRankingData;
  initialSearch?: string;
}) {
  const normalizedInitialSearch = initialSearch.trim();
  const [eventId, setEventId] = useState("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ scope: "world", regionId: "" });
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [entries, setEntries] = useState<RankingEntry[]>(initialData?.entries ?? []);
  const [startRank, setStartRank] = useState(initialData?.startRank ?? 1);
  const [nextPageStart, setNextPageStart] = useState<number | null>(initialData?.nextPageStart ?? null);
  const [previousPageStart, setPreviousPageStart] = useState<number | null>(initialData?.previousPageStart ?? null);
  const [total, setTotal] = useState(initialData?.total ?? Number.POSITIVE_INFINITY);
  const [fetchedAt, setFetchedAt] = useState<string | null>(initialData?.fetchedAt ?? null);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true);
  const [loading, setLoading] = useState(!initialData);
  const [preserveListDuringLoad, setPreserveListDuringLoad] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [findOpen, setFindOpen] = useState(Boolean(normalizedInitialSearch));
  const [findQuery, setFindQuery] = useState(initialSearch);
  const [findMatches, setFindMatches] = useState<RankingEntry[]>(initialData?.searchMatches ?? []);
  const [findIndex, setFindIndex] = useState(initialData?.searchMatches.length ? 0 : -1);
  const [findLoading, setFindLoading] = useState(false);
  const [findResolvedQuery, setFindResolvedQuery] = useState(normalizedInitialSearch);
  const [findError, setFindError] = useState("");
  const [highlightedPersonId, setHighlightedPersonId] = useState(initialData?.initialMatchPersonId ?? "");
  const [findFloating, setFindFloating] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const moreRequestRef = useRef(false);
  const previousRequestRef = useRef(false);
  const pendingRankRef = useRef(1);
  const pendingPersonIdRef = useRef("");
  const pendingScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const preserveListDuringLoadRef = useRef(false);
  const initialPageRef = useRef(Boolean(initialData));
  const initialScrollRef = useRef(Boolean(initialData && normalizedInitialSearch && initialData.initialMatchPersonId));
  const initialSearchRef = useRef(Boolean(initialData && normalizedInitialSearch));
  const findMatchesRef = useRef<RankingEntry[]>(initialData?.searchMatches ?? []);
  const findIndexRef = useRef(initialData?.searchMatches.length ? 0 : -1);
  const entriesRef = useRef(entries);
  const startRankRef = useRef(startRank);

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    // This state keeps the server-rendered list in the DOM for the hydration pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    const measure = () => setListOffset(listRef.current?.offsetTop ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [eventId, rankingType, loading, regionSelection]);

  useIsomorphicLayoutEffect(() => {
    if (!initialScrollRef.current || !initialData?.initialMatchPersonId) return;
    const targetIndex = entries.findIndex((entry) => entry.personId === initialData.initialMatchPersonId);
    if (targetIndex < 0) return;
    initialScrollRef.current = false;
    scrollToEntry(listRef.current, targetIndex, "center", "smooth", null, false);
  }, [entries, initialData]);

  useEffect(() => {
    entriesRef.current = entries;
    startRankRef.current = startRank;
  }, [entries, startRank]);

  useEffect(() => {
    const updateFindPosition = () => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      setFindFloating(Boolean(findQuery.trim() && window.scrollY > headerHeight));
    };
    updateFindPosition();
    window.addEventListener("scroll", updateFindPosition, { passive: true });
    return () => window.removeEventListener("scroll", updateFindPosition);
  }, [findQuery]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/regions?kind=continent").then((response) => response.json() as Promise<{ regions?: Array<{ id: string; name: string }> }>),
      fetch("/api/regions?kind=country").then((response) => response.json() as Promise<{ regions?: Array<{ id: string; name: string; iso2?: string }> }>),
    ]).then(([continentData, countryData]) => {
      if (!active) return;
      const continents = (continentData.regions?.length ? continentData.regions : FALLBACK_CONTINENTS).map((region) => ({
        key: `continent:${region.id}`,
        scope: "continent" as const,
        regionId: region.id,
        label: region.name.replace(/^_/, ""),
      }));
      const countryRegions: Array<{ id: string; name: string; iso2?: string }> =
        countryData.regions?.length ? countryData.regions : FALLBACK_COUNTRIES;
      const countries = countryRegions.map((region) => ({
        key: `country:${region.id}`,
        scope: "country" as const,
        regionId: region.id,
        label: region.name,
        iso2: region.iso2,
      }));
      setRegions([
        { key: "world", scope: "world", regionId: "", label: "World" },
        ...continents,
        ...countries,
      ]);
    }).catch(() => {
      if (!active) return;
      setRegions([
        { key: "world", scope: "world", regionId: "", label: "World" },
        ...FALLBACK_CONTINENTS.map((region) => ({ key: `continent:${region.id}`, scope: "continent" as const, regionId: region.id, label: region.name.replace(/^_/, "") })),
        ...FALLBACK_COUNTRIES.map((region) => ({ key: `country:${region.id}`, scope: "country" as const, regionId: region.id, label: region.name })),
      ]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncSearchFromUrl = () => {
      const url = new URL(window.location.href);
      const search = url.searchParams.get("search") ?? "";
      setFindQuery(search);
      setFindOpen(Boolean(search.trim()));
    };

    syncSearchFromUrl();
    window.addEventListener("popstate", syncSearchFromUrl);
    return () => window.removeEventListener("popstate", syncSearchFromUrl);
  }, []);

  useEffect(() => {
    if (initialPageRef.current) {
      initialPageRef.current = false;
      return;
    }
    let active = true;
    // This reset is coupled to the request started immediately below.
    setLoading(true);
    if (!preserveListDuringLoadRef.current) setEntries([]);
    setNextPageStart(null);
    setPreviousPageStart(null);
    setHasMore(true);
    setTotal(Number.POSITIVE_INFINITY);
    setError("");
    moreRequestRef.current = false;
    previousRequestRef.current = false;

    getPage(eventId, rankingType, startRank, regionSelection)
      .then((data) => {
        if (!active) return;
        setEntries(data.entries);
        setNextPageStart(data.nextPageStart);
        setPreviousPageStart(data.previousPageStart);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setFetchedAt(data.fetchedAt);
        const pendingPersonId = pendingPersonIdRef.current;
        const pendingDirection = pendingScrollDirectionRef.current;
        const targetIndex = pendingPersonId
          ? data.entries.findIndex((entry) => entry.personId === pendingPersonId)
          : data.entries.findIndex((entry) => entry.rank >= pendingRankRef.current);
        pendingPersonIdRef.current = "";
        pendingScrollDirectionRef.current = null;
        const shouldAnimate = Boolean(pendingPersonId || pendingDirection || startRank !== 1);
        if (startRank === 1 && !shouldAnimate) window.scrollTo({ top: 0, behavior: "auto" });
        else scrollToEntry(
          listRef.current,
          targetIndex,
          pendingPersonId ? "center" : "top",
          shouldAnimate ? "smooth" : "auto",
          pendingDirection,
        );
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Rankings are unavailable.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          preserveListDuringLoadRef.current = false;
          setPreserveListDuringLoad(false);
        }
      });

    return () => { active = false; };
  }, [eventId, rankingType, regionSelection, startRank]);

  const jumpToMatch = useCallback((match: RankingEntry) => {
    pendingRankRef.current = match.rank;
    pendingPersonIdRef.current = match.personId;
    const currentRank = getCurrentViewportRank(listRef.current, entriesRef.current, startRankRef.current);
    pendingScrollDirectionRef.current = match.rank < currentRank ? -1 : match.rank > currentRank ? 1 : null;
    setHighlightedPersonId(match.personId);
    const nextStart = pageStartForRank(match.rank);
    if (nextStart === startRankRef.current) {
      const targetIndex = entriesRef.current.findIndex((entry) => entry.personId === match.personId);
      if (targetIndex >= 0) {
        pendingPersonIdRef.current = "";
        scrollToEntry(listRef.current, targetIndex, "center", "smooth", pendingScrollDirectionRef.current);
        pendingScrollDirectionRef.current = null;
      }
      return;
    }
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setStartRank(nextStart);
  }, []);

  const cycleFind = useCallback((direction: 1 | -1 = 1) => {
    const matches = findMatchesRef.current;
    if (matches.length === 0) return;
    const currentIndex = findIndexRef.current;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : matches.length - 1
      : (currentIndex + direction + matches.length) % matches.length;
    findIndexRef.current = nextIndex;
    setFindIndex(nextIndex);
    jumpToMatch(matches[nextIndex]);
  }, [jumpToMatch]);

  const resetFind = useCallback(() => {
    findMatchesRef.current = [];
    findIndexRef.current = -1;
    setSearchQueryParam("");
    setFindQuery("");
    setFindMatches([]);
    setFindIndex(-1);
    setFindLoading(false);
    setFindResolvedQuery("");
    setFindError("");
    setHighlightedPersonId("");
    pendingScrollDirectionRef.current = null;
  }, []);

  useEffect(() => {
    const normalizedQuery = findQuery.trim();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      if (initialSearchRef.current && normalizedQuery === normalizedInitialSearch) {
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
      searchRankings(eventId, rankingType, regionSelection, normalizedQuery, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setFindResolvedQuery(normalizedQuery);
          findMatchesRef.current = data.entries;
          setFindMatches(data.entries);
          if (data.entries.length > 0) {
            findIndexRef.current = 0;
            setFindIndex(0);
            jumpToMatch(data.entries[0]);
          }
        })
        .catch((requestError: unknown) => {
          if (!controller.signal.aborted) {
            setFindResolvedQuery(normalizedQuery);
            setFindError(requestError instanceof Error ? requestError.message : "Search is unavailable.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setFindLoading(false);
        });
    }, normalizedQuery ? 800 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [eventId, findQuery, normalizedInitialSearch, rankingType, regionSelection, jumpToMatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        setFindOpen(true);
        if (!findQuery.trim()) resetFind();
        window.requestAnimationFrame(() => findInputRef.current?.focus());
      } else if ((event.ctrlKey || event.metaKey) && key === "g") {
        event.preventDefault();
        setFindOpen(true);
        if (findQuery.trim()) cycleFind();
        else resetFind();
      } else if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        setFindOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleFind, findOpen, findQuery, resetFind]);

  const loadMore = useCallback(async () => {
    if (!nextPageStart || !hasMore || moreRequestRef.current || loading) return;
    moreRequestRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getPage(eventId, rankingType, nextPageStart, regionSelection);
      setEntries((current) => [...current, ...data.entries.filter((entry) => !current.some((item) => item.personId === entry.personId))]);
      setNextPageStart(data.nextPageStart);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setFetchedAt(data.fetchedAt);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more rankings.");
    } finally {
      moreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [eventId, hasMore, loading, nextPageStart, rankingType, regionSelection]);

  const loadPrevious = useCallback(async () => {
    if (!previousPageStart || previousRequestRef.current || loading) return;
    previousRequestRef.current = true;
    setLoadingPrevious(true);
    try {
      const data = await getPage(eventId, rankingType, previousPageStart, regionSelection);
      const addedCount = data.entries.length;
      setEntries((current) => [...data.entries.filter((entry) => !current.some((item) => item.personId === entry.personId)), ...current]);
      setPreviousPageStart(data.previousPageStart);
      setFetchedAt(data.fetchedAt);
      window.requestAnimationFrame(() => window.scrollBy({ top: addedCount * ROW_HEIGHT, behavior: "auto" }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load earlier rankings.");
    } finally {
      previousRequestRef.current = false;
      setLoadingPrevious(false);
    }
  }, [eventId, loading, previousPageStart, rankingType, regionSelection]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    // Loading the next bucket is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - 12) void loadMore();
  }, [entries.length, loadMore, virtualRows]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      if (window.scrollY < lastScrollY && window.scrollY <= listOffset + ROW_HEIGHT * 14) void loadPrevious();
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listOffset, loadPrevious]);

  const visibleRank = entries[virtualRows[0]?.index ?? 0]?.rank ?? startRank;
  const renderedRows = hydrated
    ? virtualRows
    : entries.map((_, index) => ({ index, start: index * ROW_HEIGHT, key: index }));
  const renderedListHeight = hydrated
    ? rowVirtualizer.getTotalSize()
    : entries.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);

  const resetToRank = (rank: number) => {
    const normalizedRank = Math.max(1, Math.min(rank, Number.isFinite(total) ? total : rank));
    pendingRankRef.current = normalizedRank;
    pendingPersonIdRef.current = "";
    const currentRank = getCurrentViewportRank(listRef.current, entriesRef.current, startRankRef.current);
    pendingScrollDirectionRef.current = normalizedRank < currentRank ? -1 : normalizedRank > currentRank ? 1 : null;
    const nextStart = pageStartForRank(normalizedRank);
    if (nextStart === startRank) {
      const targetIndex = entries.findIndex((entry) => entry.rank >= normalizedRank);
      if (targetIndex >= 0) {
        scrollToEntry(listRef.current, targetIndex, "top", "smooth", pendingScrollDirectionRef.current);
        pendingScrollDirectionRef.current = null;
      }
      return;
    }
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setStartRank(nextStart);
  };

  const toggleSingle = () => {
    pendingRankRef.current = 1;
    pendingPersonIdRef.current = "";
    pendingScrollDirectionRef.current = null;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setRankingType((current) => current === "single" ? "average" : "single");
    setStartRank(1);
  };

  const openFind = () => {
    setFindOpen(true);
    window.requestAnimationFrame(() => findInputRef.current?.focus());
  };

  const findPending = Boolean(findQuery.trim()) && findQuery.trim() !== findResolvedQuery;

  return (
    <div className="app">
      <header className="header" ref={headerRef}>
        <div className="headerTitle">
          <h1 className="title"><a href="https://wcarankings.com">WCA Rankings</a></h1>
          {findOpen ? (
            <div
              className={`findBar${findFloating ? " findBar--floating" : ""}`}
              role="search"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFindOpen(false);
              }}
            >
              <span className="findIcon" aria-hidden="true"><SearchIcon /></span>
              <input
                ref={findInputRef}
                className="findInput"
                type="search"
                value={findQuery}
                onChange={(event) => {
                  setFindResolvedQuery("");
                  setSearchQueryParam(event.target.value);
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
              <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">
                {findError || (findLoading || findPending ? "Searching…" : findQuery.trim() ? findMatches.length ? `${findIndex + 1} of ${findMatches.length}` : "No matches" : "")}
              </span>
              <button className="findClose" type="button" onClick={() => setFindOpen(false)} aria-label="Close search">×</button>
            </div>
          ) : (
            <button
              className={`searchButton${findFloating ? " searchButton--floating" : ""}`}
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
          <div className="selectInput">
            <select name="Event Id" onChange={(event) => { pendingRankRef.current = 1; preserveListDuringLoadRef.current = false; setPreserveListDuringLoad(false); setStartRank(1); setEventId(event.target.value); }} value={eventId}>
              {Object.entries(EVENTS_MAP).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <SelectArrow />
          </div>
              <div className="selectInput rankingTypeInput">
                <select name="Ranking type" onChange={toggleSingle} value={rankingType}>
                  <option value="single">Single</option>
                  <option value="average">Average</option>
                </select>
                <SelectArrow />
              </div>
              {regions.length > 0 && (
                <RegionPicker
                  options={regions}
                  selected={regionSelection}
                  onChange={(option) => {
                    pendingRankRef.current = 1;
                    preserveListDuringLoadRef.current = false;
                    setPreserveListDuringLoad(false);
                    setStartRank(1);
                    setRegionSelection({ scope: option.scope, regionId: option.regionId });
                  }}
                />
              )}
        </div>
      </header>

      <main>
        <div className={`Jump Jump--up${visibleRank > VISIBLE_AFTER_NUM_ENTRIES ? " visible" : ""}`}>
          <button className="Jump-button" onClick={() => resetToRank(visibleRank > 5000 ? visibleRank - 5000 : 1)}>
            <Arrow direction="up" /><span>{visibleRank > 5000 ? `Jump ${formatRankingNumber(5000)}` : "Jump to top"}</span><Arrow direction="up" />
          </button>
        </div>

        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {loadingPrevious && <div className="listMessage">Loading earlier rankings…</div>}
            {error ? <div className="listMessage">{error}</div> : loading && !preserveListDuringLoad ? (
              <ol className="list loadingList">{Array.from({ length: 10 }, (_, index) => <RankingRow key={index} entry={null} eventId={eventId} loading animationIndex={index} />)}</ol>
            ) : (
              <ol className="list" style={{ height: `${renderedListHeight}px` }}>
                {renderedRows.map((virtualRow) => {
                  const entry = entries[virtualRow.index] ?? null;
                  return (
                    <div className="virtualRow" key={virtualRow.key} style={{ transform: `translateY(${virtualRow.start - listOffset}px)` }}>
                      {entry ? <RankingRow entry={entry} eventId={eventId} loading={false} animationIndex={virtualRow.index} highlighted={entry.personId === highlightedPersonId} /> : <div className="listMessage">{loadingMore ? "Loading more results…" : "Keep scrolling…"}</div>}
                    </div>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className={`Jump Jump--down${visibleRank > VISIBLE_AFTER_NUM_ENTRIES && visibleRank < total - 50 ? " visible" : ""}`}>
          <button className="Jump-button" onClick={() => resetToRank(visibleRank < total - 5000 ? visibleRank + 5000 : total)}>
            <Arrow direction="down" /><span>{visibleRank < total - 5000 ? `Jump ${formatRankingNumber(5000)}` : "Jump to end"}</span><Arrow direction="down" />
          </button>
          </div>
        </main>
        <footer className="siteFooter">
          <span>By Adam Walker and Cailyn Sinclair</span>
          <span>{fetchedAt ? `fetched ${formatFetchedAgo(fetchedAt)}` : "fetched time unavailable"}</span>
        </footer>
      </div>
  );
}
