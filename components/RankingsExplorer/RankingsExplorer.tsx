"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  isEventId,
  isRankingType,
  parseRegionQuery,
  WCA_EVENTS,
} from "@/lib/wca";
import { VimHelp } from "../VimHelp/VimHelp";
import { VimSearchInput } from "../VimSearchInput/VimSearchInput";
import { JumpControls } from "../JumpControls/JumpControls";
import { RankingControls } from "../RankingControls/RankingControls";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { SearchInputs } from "../SearchInputs/SearchInputs";
import { formatFetchedAgo, type InitialRankingData, type RankingEntry, type RankingPage, type RegionOption, type RegionSelection } from "./types";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 61.6;
const MIN_SCROLL_ANIMATION_DURATION_MS = 1000;
const MAX_SCROLL_ANIMATION_DURATION_MS = 1800;
const LOG_SCROLL_DURATION_PER_DECADE_MS = 150;
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

const pageCache = new Map<string, Promise<RankingPage>>();

function searchPageStartForRank(rank: number) {
  return Math.max(1, Math.max(1, rank) - Math.floor(PAGE_SIZE / 2));
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
  selection: RegionSelection,
  focusPersonId = "",
  focusBefore = 50
) {
  const pageStart = Math.max(1, Math.floor(start));
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    start: String(pageStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  if (selection.scope !== "world") params.set("region", selection.regionId);
  if (focusPersonId) {
    params.set("focus", focusPersonId);
    params.set("focusBefore", String(focusBefore));
  }
  const cacheKey = params.toString();
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  const request = fetch(`/api/rankings?${params}`).then(async (response) => {
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

type ScrollAnimationState = {
  frame: number | null;
  active: boolean;
  programmatic: boolean;
  clearProgrammaticTimer: number | null;
};

function cancelScrollAnimation(state: ScrollAnimationState) {
  if (state.frame !== null) window.cancelAnimationFrame(state.frame);
  if (state.clearProgrammaticTimer !== null)
    window.clearTimeout(state.clearProgrammaticTimer);
  state.frame = null;
  state.active = false;
  state.programmatic = false;
  state.clearProgrammaticTimer = null;
}

function finishProgrammaticScroll(state: ScrollAnimationState) {
  state.active = false;
  state.frame = null;
  state.clearProgrammaticTimer = window.setTimeout(() => {
    state.programmatic = false;
    state.clearProgrammaticTimer = null;
  }, 0);
}

function getScrollAnimationDuration(peopleDistance: number) {
  return Math.min(
    MAX_SCROLL_ANIMATION_DURATION_MS,
    MIN_SCROLL_ANIMATION_DURATION_MS +
      LOG_SCROLL_DURATION_PER_DECADE_MS *
        Math.log10(Math.max(0, peopleDistance) + 1)
  );
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function animateScrollTo(
  state: ScrollAnimationState,
  targetTop: number,
  requestedBehavior: ScrollBehavior,
  durationMs = MIN_SCROLL_ANIMATION_DURATION_MS
) {
  cancelScrollAnimation(state);
  state.programmatic = true;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (requestedBehavior !== "smooth" || reducedMotion) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
    finishProgrammaticScroll(state);
    return;
  }

  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  if (Math.abs(distance) < 1) {
    finishProgrammaticScroll(state);
    return;
  }
  const startedAt = performance.now();
  state.active = true;
  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const easedProgress = easeInOutCubic(progress);
    window.scrollTo({
      top: startTop + distance * easedProgress,
      behavior: "auto",
    });
    if (progress < 1) state.frame = window.requestAnimationFrame(animate);
    else finishProgrammaticScroll(state);
  };
  state.frame = window.requestAnimationFrame(animate);
}

function scrollToEntry({
  state,
  list,
  index,
  alignment = "top",
  requestedBehavior = "smooth",
  schedule = true,
  requestedDuration = MIN_SCROLL_ANIMATION_DURATION_MS,
  targetOffset,
}: {
  state: ScrollAnimationState;
  list: HTMLDivElement | null;
  index: number;
  alignment?: "top" | "center";
  requestedBehavior?: ScrollBehavior;
  requestedDirection?: -1 | 1 | null;
  schedule?: boolean;
  requestedDuration?: number;
  targetOffset?: () => number | undefined;
}) {
  const scroll = () => {
    const listTop = list?.getBoundingClientRect().top ?? 0;
    const viewportOffset =
      alignment === "center"
        ? Math.max(0, (window.innerHeight - ROW_HEIGHT) / 2)
        : 0;
    const fallbackTargetTop =
      listTop +
      window.scrollY +
      Math.max(0, index) * ROW_HEIGHT -
      viewportOffset;
    const targetTop = Math.max(0, targetOffset?.() ?? fallbackTargetTop);
    animateScrollTo(state, targetTop, requestedBehavior, requestedDuration);
  };
  if (schedule) {
    cancelScrollAnimation(state);
    state.programmatic = true;
    state.frame = window.requestAnimationFrame(() => {
      state.frame = null;
      scroll();
    });
  } else scroll();
}

function getCurrentViewportPosition(
  list: HTMLDivElement | null,
  entries: RankingEntry[],
  startPosition: number,
  fallbackPosition: number,
  visibleIndex?: number
) {
  if (!list || entries.length === 0) return fallbackPosition;
  const listTop = list.getBoundingClientRect().top;
  const index =
    visibleIndex ??
    Math.max(
      0,
      Math.min(entries.length - 1, Math.floor(-listTop / ROW_HEIGHT))
    );
  return startPosition + index;
}

function getCurrentViewportSubRank(
  list: HTMLDivElement | null,
  entries: RankingEntry[],
  fallbackSubRank: number
) {
  if (!list || entries.length === 0) return fallbackSubRank;
  const listTop = list.getBoundingClientRect().top;
  const index = Math.max(
    0,
    Math.min(entries.length - 1, Math.floor(-listTop / ROW_HEIGHT))
  );
  return entries[index]?.subRank ?? fallbackSubRank;
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
  const pendingPersonIdRef = useRef("");
  const pendingFocusPersonIdRef = useRef("");
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
  const initialPageRef = useRef(Boolean(initialData));
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
  const entriesRef = useRef(entries);
  const startRankRef = useRef(startRank);
  const startPositionRef = useRef(startPosition);
  const scrollAnimationStateRef = useRef<ScrollAnimationState>({
    frame: null,
    active: false,
    programmatic: false,
    clearProgrammaticTimer: null,
  });

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
          alignment: "center",
          requestedDuration: getScrollAnimationDuration(targetIndex),
          targetOffset: () =>
            rowVirtualizer.getOffsetForIndex(targetIndex, "center")?.[0],
          schedule: false,
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [entries, hydrated, initialData, rowVirtualizer]);

  useEffect(() => {
    entriesRef.current = entries;
    startRankRef.current = startRank;
    startPositionRef.current = startPosition;
  }, [entries, startPosition, startRank]);

  useEffect(() => {
    const updateFindPosition = () => {
      setFindFloating(window.scrollY > 0);
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
    if (initialPageRef.current) {
      initialPageRef.current = false;
      return;
    }
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
    const focusPersonId = pendingFocusPersonIdRef.current;
    pendingFocusPersonIdRef.current = "";
    const focusLast = pendingFocusLastRef.current;
    pendingFocusLastRef.current = false;
    const focusDirection = pendingScrollDirectionRef.current;
    const focusBefore = focusPersonId
      ? focusDirection === 1
        ? Math.floor(PAGE_SIZE * 0.75)
        : focusDirection === -1
        ? Math.floor(PAGE_SIZE * 0.25)
        : Math.floor(PAGE_SIZE / 2)
      : Math.floor(PAGE_SIZE / 2);

    getPage(
      eventId,
      rankingType,
      startRank,
      regionSelection,
      focusPersonId,
      focusBefore
    )
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
          rowVirtualizer.getVirtualItems()[0]?.index
        );
        const scrollToTop = pendingScrollToTopRef.current;
        const pendingPersonId = pendingPersonIdRef.current;
        const pendingDirection = pendingScrollDirectionRef.current;
        const appendNavigation =
          pendingNavigationAppendRef.current &&
          !scrollToTop &&
          !focusPersonId &&
          !pendingPersonId &&
          !focusLast &&
          Boolean(pendingDirection);
        const previousEntries = entriesRef.current;
        const previousStartPosition = startPositionRef.current;
        const previousListHeight = appendNavigation && pendingDirection === -1
          ? rowVirtualizer.getTotalSize()
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
        const requestedTargetIndex = pendingPersonId
          ? loadedEntries.findIndex(
              (entry) => entry.personId === pendingPersonId
            )
          : focusLast
          ? Math.max(0, loadedEntries.length - 1)
          : loadedEntries.findIndex(
              (entry) => entry.subRank >= pendingRankRef.current
            );
        const targetIndex =
          requestedTargetIndex >= 0
            ? requestedTargetIndex
            : pendingDirection === -1
            ? Math.max(0, loadedEntries.length - 1)
            : 0;
        const targetPosition =
          (appendNavigation ? loadedStartPosition : data.startPosition) +
          targetIndex;
        const shouldScrollToTarget = Boolean(
          scrollToTop ||
            focusPersonId ||
            pendingPersonId ||
            focusLast ||
            pendingDirection ||
            appendNavigation
        );
        pendingPersonIdRef.current = "";
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
                rowVirtualizer.getTotalSize() - previousListHeight
              );
              if (addedHeight > 0)
                window.scrollBy({ top: addedHeight, behavior: "auto" });
            });
          }
          scrollToEntry({
            state: scrollAnimationStateRef.current,
            list: listRef.current,
            index: targetIndex,
            alignment: pendingPersonId ? "center" : "top",
            requestedBehavior: "smooth",
            requestedDirection: pendingDirection,
            requestedDuration: getScrollAnimationDuration(
              Math.abs(targetPosition - currentPosition)
            ),
            targetOffset: () =>
              rowVirtualizer.getOffsetForIndex(
                targetIndex,
                pendingPersonId ? "center" : "start"
              )?.[0],
          });
        }
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          preserveListDuringLoadRef.current = false;
          setPreserveListDuringLoad(false);
        }
      });

    return () => {
      active = false;
    };
  }, [eventId, rankingType, regionSelection, rowVirtualizer, startRank]);

  const jumpToMatch = useCallback(
    (match: RankingEntry) => {
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingNavigationAppendRef.current = false;
      pendingRankRef.current = match.subRank;
      navigationTargetRankRef.current = match.subRank;
      pendingPersonIdRef.current = match.personId;
      pendingFocusPersonIdRef.current = match.personId;
      const currentPosition = getCurrentViewportPosition(
        listRef.current,
        entriesRef.current,
        startPositionRef.current,
        startPositionRef.current,
        rowVirtualizer.getVirtualItems()[0]?.index
      );
      const currentRank = getCurrentViewportSubRank(
        listRef.current,
        entriesRef.current,
        startRankRef.current
      );
      pendingScrollDirectionRef.current =
        match.subRank < currentRank ? -1 : match.subRank > currentRank ? 1 : null;
      setHighlightedPersonId(match.personId);
      const targetIndex = entriesRef.current.findIndex(
        (entry) => entry.personId === match.personId
      );
      if (targetIndex >= 0) {
        pendingFocusPersonIdRef.current = "";
        pendingPersonIdRef.current = "";
        const requestedDuration = getScrollAnimationDuration(
          Math.abs(startPositionRef.current + targetIndex - currentPosition)
        );
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "center",
          requestedBehavior: "smooth",
          requestedDirection: pendingScrollDirectionRef.current,
          requestedDuration,
          targetOffset: () =>
            rowVirtualizer.getOffsetForIndex(targetIndex, "center")?.[0],
        });
        pendingScrollDirectionRef.current = null;
        return;
      }
      const nextStart = searchPageStartForRank(match.subRank);
      preserveListDuringLoadRef.current = true;
      setPreserveListDuringLoad(true);
      setStartRank(nextStart);
    },
    [rowVirtualizer]
  );

  const cycleFind = useCallback(
    (direction: 1 | -1 = 1) => {
      const matches = findMatchesRef.current;
      if (matches.length === 0) return;
      const currentIndex = findIndexRef.current;
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : matches.length - 1
          : (currentIndex + direction + matches.length) % matches.length;
      findIndexRef.current = nextIndex;
      setFindIndex(nextIndex);
      jumpToMatch(matches[nextIndex]);
    },
    [jumpToMatch]
  );

  const resetFind = useCallback(() => {
    findMatchesRef.current = [];
    findIndexRef.current = -1;
    updateQueryParams({ search: null });
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
      const target = event.target as HTMLElement | null;
      const isEditable = target?.matches(
        "input, textarea, select, [contenteditable='true']"
      );
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
      navigationTargetRankRef.current = null;
      pendingNavigationAppendRef.current = false;
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

  useEffect(
    () => () => cancelScrollAnimation(scrollAnimationStateRef.current),
    []
  );

  const visibleSubRank =
    entries[virtualRows[0]?.index ?? 0]?.subRank ?? startRank;
  const renderedRows = hydrated
    ? virtualRows
    : entries.map((_, index) => ({
        index,
        start: index * ROW_HEIGHT,
        key: index,
      }));
  const renderedListHeight = hydrated
    ? rowVirtualizer.getTotalSize()
    : entries.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);

  const resetToRank = useCallback(
    (rank: number) => {
      // Vim and jump controls pass the internal sub_rank, never the displayed rank.
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingNavigationAppendRef.current = false;
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
        pendingPersonIdRef.current = "";
        pendingFocusPersonIdRef.current = "";
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
      pendingPersonIdRef.current = "";
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
      const nextStart =
        pendingScrollDirectionRef.current === 1
          ? Math.max(1, normalizedRank - PAGE_SIZE + 1)
          : normalizedRank;
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
        const targetPosition = startPosition + targetIndex;
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "top",
          requestedBehavior: "smooth",
          requestedDirection: pendingScrollDirectionRef.current,
          requestedDuration: getScrollAnimationDuration(
            Math.abs(targetPosition - currentPosition)
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
      startPosition,
      startRank,
      total,
    ]
  );

  const jumpToEnd = useCallback(() => {
    navigationEpochRef.current += 1;
    cancelScrollAnimation(scrollAnimationStateRef.current);
    pendingNavigationAppendRef.current = false;
    const endRank = lastRank ?? (Number.isFinite(total) ? total : visibleSubRank);
    const nextStart = Math.max(1, endRank - PAGE_SIZE + 1);
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
    navigationTargetRankRef.current = endRank;
    pendingRankRef.current = endRank;
    pendingScrollToTopRef.current = false;
    pendingPersonIdRef.current = "";
    pendingFocusPersonIdRef.current = "";
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
        requestedDirection: pendingScrollDirectionRef.current,
        requestedDuration: getScrollAnimationDuration(
          Math.abs(startPosition + targetIndex - currentPosition)
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
    startPosition,
    total,
    visibleSubRank,
  ]);

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
    resetToRank((navigationTargetRankRef.current ?? visibleSubRank) - 5000);
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
    resetToRank((navigationTargetRankRef.current ?? visibleSubRank) + 5000);
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
      const currentRank = navigationTargetRankRef.current ?? visibleSubRank;

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
        resetToRankRef.current(currentRank - PAGE_SIZE);
      } else if (
        command === "k" ||
        command === "u" ||
        lowerCommand === "up" ||
        lowerCommand === "pageup"
      ) {
        resetToRankRef.current(currentRank + PAGE_SIZE);
      } else if (/^[+-]\d+$/.test(command)) {
        resetToRankRef.current(currentRank + Number(command));
      } else if (/^\d[\d,]*$/.test(command)) {
        resetToRankRef.current(Number(command.replaceAll(",", "")));
      }
    },
    [visibleSubRank]
  );

  useEffect(() => {
    const onVimKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.matches(
        "input, textarea, select, [contenteditable='true']"
      );

      if (event.key === "Escape" && (vimMode || vimSearchActive)) {
        event.preventDefault();
        cancelVimSearch();
        return;
      }

      if (!vimMode) {
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
    pendingPersonIdRef.current = "";
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
  const activeFindMatch = findMatches[findIndex] ?? null;

  return (
    <div className={`app${vimMode || vimSearchActive ? " app--vimMode" : ""}`}>
      <header className="header" ref={headerRef}>
        <div className="headerTitle">
          <h1 className="title">
            <Link href="/">WCA Rankings</Link>
          </h1>
          <SearchInputs
            barRef={findBarRef}
            findOpen={findOpen}
            findFloating={findFloating}
            findQuery={findQuery}
            findError={findError}
            findLoading={findLoading}
            findPending={findPending}
            findMatches={findMatches}
            findIndex={findIndex}
            activeFindMatch={activeFindMatch}
            onOpen={openFind}
            onClose={() => setFindOpen(false)}
            onQueryChange={(value) => {
              setVimSearchActive(false);
              setVimSearchQuery("");
              setRegexSearch(false);
              setFindResolvedQuery("");
              updateQueryParams({ search: value.trim() ? value : null, mode: null });
              setFindQuery(value);
            }}
            onCycle={cycleFind}
          />
        </div>
        <RankingControls
          eventId={eventId}
          rankingType={rankingType}
          regions={regions}
          regionSelection={regionSelection}
          onEventChange={changeEvent}
          onRankingTypeChange={changeRankingType}
          onRegionChange={changeRegion}
        />
      </header>

      <main>
        <JumpControls
          direction="up"
          visible={visibleSubRank > 1 || jumpUpArmed}
          armed={jumpUpArmed}
          currentPosition={visibleSubRank}
          total={total}
          onJump={handleJumpUp}
        />

        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {loadingPrevious && (
              <div className="listMessage">Loading earlier rankings…</div>
            )}
            {error ? (
              <div className="listMessage">{error}</div>
            ) : (
              <ResultsTable
                entries={entries}
                renderedRows={renderedRows}
                renderedListHeight={renderedListHeight}
                listOffset={listOffset}
                eventId={eventId}
                rankingType={rankingType}
                loading={loading}
                preserveListDuringLoad={preserveListDuringLoad}
                loadingMore={loadingMore}
                highlightedPersonId={highlightedPersonId}
                measureElement={rowVirtualizer.measureElement}
              />
            )}
          </div>
        </div>

        <JumpControls
          direction="down"
          visible={jumpDownArmed || (Number.isFinite(total) && visibleSubRank < total)}
          armed={jumpDownArmed}
          currentPosition={visibleSubRank}
          total={total}
          onJump={handleJumpDown}
        />
      </main>
      {(vimMode || vimSearchActive) && (
        <VimSearchInput
          inputRef={vimInputRef}
          value={vimMode ? vimCommand : `/${vimSearchQuery}`}
          vimMode={vimMode}
          vimSearchActive={vimSearchActive}
          findLoading={findLoading}
          findPending={findPending}
          findQuery={findQuery}
          activeFindMatch={activeFindMatch}
          findMatches={findMatches}
          vimHelpOpen={vimHelpOpen}
          onChange={setVimCommand}
          onCycle={(direction) => {
            setFindOpen(false);
            cycleFind(direction);
          }}
          onToggleHelp={() => setVimHelpOpen((open) => !open)}
        />
      )}
      {(vimMode || vimSearchActive) && vimHelpOpen && (
        <VimHelp onClose={() => setVimHelpOpen(false)} />
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
