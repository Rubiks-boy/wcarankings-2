"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  flagEmoji,
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
const ROW_HEIGHT = 54.8;
const VISIBLE_AFTER_NUM_ENTRIES = 40;

type RankingEntry = {
  rank: number;
  personId: string;
  personName: string;
  best: number;
};

type RankingPage = {
  entries: RankingEntry[];
  hasMore: boolean;
  nextPageStart: number | null;
  previousPageStart: number | null;
  total: number;
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
    };
  });

  pageCache.set(cacheKey, request);
  request.catch(() => pageCache.delete(cacheKey));
  return request;
}

function scrollToEntry(list: HTMLDivElement | null, index: number) {
  window.requestAnimationFrame(() => {
    const listTop = list?.getBoundingClientRect().top ?? 0;
    window.scrollTo({
      top: Math.max(0, listTop + window.scrollY + Math.max(0, index) * ROW_HEIGHT),
      behavior: "auto",
    });
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
      <span className="regionOptionIcon">{option.iso2 ? flagEmoji(option.iso2) : option.scope === "world" ? "🌐" : "🌍"}</span>
      <span>{option.label}</span>
    </button>
  );

  return (
    <div className="regionPicker" ref={pickerRef}>
      <button
        className="regionPickerTrigger"
        id="region-picker-button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="regionPickerValue">
          <span className="regionOptionIcon">{selectedOption?.iso2 ? flagEmoji(selectedOption.iso2) : selectedOption?.scope === "world" ? "🌐" : "🌍"}</span>
          <span>{selectedOption?.label ?? "All regions"}</span>
        </span>
        <span className="regionPickerChevron">⌄</span>
      </button>
      {open && (
        <div className="regionPickerMenu" role="listbox" aria-label="Region">
          <input
            className="regionSearch"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search regions"
            aria-label="Search regions"
          />
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

function RankingRow({ entry, eventId, loading, animationIndex }: { entry: RankingEntry | null; eventId: string; loading: boolean; animationIndex: number }) {
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
      <div className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}`}>
        <span className="rank">{rank}</span>
        <span className="name">{name}</span>
        <span className="wcaId">({id})</span>
        <span className="best">{entry ? formatWcaResult(eventId, entry.best) : ""}</span>
      </div>
    </li>
  );
}

export function RankingsExplorer() {
  const [eventId, setEventId] = useState("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ scope: "world", regionId: "" });
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [startRank, setStartRank] = useState(1);
  const [nextPageStart, setNextPageStart] = useState<number | null>(null);
  const [previousPageStart, setPreviousPageStart] = useState<number | null>(null);
  const [total, setTotal] = useState(Number.POSITIVE_INFINITY);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRequestRef = useRef(false);
  const previousRequestRef = useRef(false);
  const pendingRankRef = useRef(1);

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const measure = () => setListOffset(listRef.current?.offsetTop ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [eventId, rankingType, loading, regionSelection]);

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
        { key: "world", scope: "world", regionId: "", label: "All regions" },
        ...continents,
        ...countries,
      ]);
    }).catch(() => {
      if (!active) return;
      setRegions([
        { key: "world", scope: "world", regionId: "", label: "All regions" },
        ...FALLBACK_CONTINENTS.map((region) => ({ key: `continent:${region.id}`, scope: "continent" as const, regionId: region.id, label: region.name.replace(/^_/, "") })),
        ...FALLBACK_COUNTRIES.map((region) => ({ key: `country:${region.id}`, scope: "country" as const, regionId: region.id, label: region.name })),
      ]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    // This reset is coupled to the request started immediately below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setEntries([]);
    setNextPageStart(null);
    setPreviousPageStart(null);
    setHasMore(true);
    setTotal(Number.POSITIVE_INFINITY);
    setError("");
    moreRequestRef.current = false;
    previousRequestRef.current = false;
    window.scrollTo({ top: 0, behavior: "auto" });

    getPage(eventId, rankingType, startRank, regionSelection)
      .then((data) => {
        if (!active) return;
        setEntries(data.entries);
        setNextPageStart(data.nextPageStart);
        setPreviousPageStart(data.previousPageStart);
        setHasMore(data.hasMore);
        setTotal(data.total);
        const targetIndex = data.entries.findIndex((entry) => entry.rank >= pendingRankRef.current);
        if (startRank === 1) window.scrollTo({ top: 0, behavior: "auto" });
        else scrollToEntry(listRef.current, targetIndex);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Rankings are unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [eventId, rankingType, regionSelection, startRank]);

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

  const resetToRank = (rank: number) => {
    const normalizedRank = Math.max(1, Math.min(rank, Number.isFinite(total) ? total : rank));
    pendingRankRef.current = normalizedRank;
    const nextStart = pageStartForRank(normalizedRank);
    if (nextStart === startRank) {
      const targetIndex = entries.findIndex((entry) => entry.rank >= normalizedRank);
      if (targetIndex >= 0) scrollToEntry(listRef.current, targetIndex);
      return;
    }
    setStartRank(nextStart);
  };

  const toggleSingle = () => {
    pendingRankRef.current = 1;
    setRankingType((current) => current === "single" ? "average" : "single");
    setStartRank(1);
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">WCA Rankings</h1>
        <div className="chooser">
          <div className="selectInput">
            <select name="Event Id" onChange={(event) => { pendingRankRef.current = 1; setStartRank(1); setEventId(event.target.value); }} value={eventId}>
              {Object.entries(EVENTS_MAP).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <SelectArrow />
          </div>
              <div className="selectInput">
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
            <Arrow direction="up" /><span>{visibleRank > 5000 ? "Jump 5000" : "Jump to top"}</span><Arrow direction="up" />
          </button>
        </div>

        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {loadingPrevious && <div className="listMessage">Loading earlier rankings…</div>}
            {error ? <div className="listMessage">{error}</div> : loading ? (
              <ol className="list loadingList">{Array.from({ length: 10 }, (_, index) => <RankingRow key={index} entry={null} eventId={eventId} loading animationIndex={index} />)}</ol>
            ) : (
              <ol className="list" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {virtualRows.map((virtualRow) => {
                  const entry = entries[virtualRow.index] ?? null;
                  return (
                    <div className="virtualRow" key={virtualRow.key} style={{ transform: `translateY(${virtualRow.start - listOffset}px)` }}>
                      {entry ? <RankingRow entry={entry} eventId={eventId} loading={false} animationIndex={virtualRow.index} /> : <div className="listMessage">{loadingMore ? "Loading more results…" : "Keep scrolling…"}</div>}
                    </div>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className={`Jump Jump--down${visibleRank > VISIBLE_AFTER_NUM_ENTRIES && visibleRank < total - 50 ? " visible" : ""}`}>
          <button className="Jump-button" onClick={() => resetToRank(visibleRank < total - 5000 ? visibleRank + 5000 : total)}>
            <Arrow direction="down" /><span>{visibleRank < total - 5000 ? "Jump 5000" : "Jump to end"}</span><Arrow direction="down" />
          </button>
          </div>
        </main>
        <footer className="siteFooter">
          <span>UI by Adam Walker</span>
          <span>Backend by Cailyn Sinclair</span>
        </footer>
      </div>
  );
}
