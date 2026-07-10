"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  WCA_EVENTS,
  flagEmoji,
  formatWcaResult,
  type RankingEntry,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";
import type { WcaProfile } from "@/lib/wca-auth";

type RankingsResponse = {
  entries: RankingEntry[];
  hasMore: boolean;
  total: number;
  source: "wca" | "demo";
};

type RegionOption = { id: string; name: string };

const PAGE_SIZE = 100;
const PAGE_CACHE_LIMIT = 120;
const ROW_HEIGHT = 66;
const rankingPageCache = new Map<string, Promise<RankingsResponse>>();

function pageStartForRank(rank: number) {
  return Math.floor((Math.max(1, rank) - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
}

function scrollToListIndex(list: HTMLDivElement | null, index: number) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const headerHeight = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--header-height"),
      ) || 112;
      window.scrollTo({
        top: Math.max(0, (list?.offsetTop ?? 0) + Math.max(0, index) * ROW_HEIGHT - headerHeight),
        behavior: "auto",
      });
    });
  });
}

function getRankingPage({
  eventId,
  rankingType,
  scope,
  regionId,
  pageStart,
}: {
  eventId: string;
  rankingType: RankingType;
  scope: RegionScope;
  regionId: string;
  pageStart: number;
}) {
  const snappedStart = pageStartForRank(pageStart);
  const parameters = new URLSearchParams({
    event: eventId,
    type: rankingType,
    scope,
    region: regionId,
    start: String(snappedStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  const cacheKey = parameters.toString();
  const cached = rankingPageCache.get(cacheKey);
  if (cached) return cached;

  const request = fetch(`/api/rankings?${parameters}`).then(async (response) => {
    if (!response.ok) {
      throw new Error((await response.json() as { error?: string }).error ?? "Rankings are unavailable.");
    }
    return response.json() as Promise<RankingsResponse>;
  });
  rankingPageCache.set(cacheKey, request);
  request.catch(() => rankingPageCache.delete(cacheKey));

  if (rankingPageCache.size > PAGE_CACHE_LIMIT) {
    const oldestKey = rankingPageCache.keys().next().value;
    if (oldestKey) rankingPageCache.delete(oldestKey);
  }
  return request;
}

function CubeMark() {
  const colors = ["lime", "cream", "orange", "cream", "orange", "lime", "orange", "lime", "cream"];
  return (
    <span className="cube-mark" aria-hidden="true">
      {colors.map((color, index) => <span className={`cube-tile cube-tile-${color}`} key={index} />)}
    </span>
  );
}

export function RankingsExplorer() {
  const [eventId, setEventId] = useState("333");
  const [rankingType, setRankingType] = useState<RankingType>("single");
  const [scope, setScope] = useState<RegionScope>("world");
  const [regionId, setRegionId] = useState("");
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [nextPageStart, setNextPageStart] = useState<number | null>(PAGE_SIZE + 1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"wca" | "demo">("demo");
  const [startRank, setStartRank] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [jumpId, setJumpId] = useState("");
  const [jumpMessage, setJumpMessage] = useState("");
  const [highlightId, setHighlightId] = useState("");
  const [jumpAnimation, setJumpAnimation] = useState<{ from: number; to: number } | null>(null);
  const [profile, setProfile] = useState<WcaProfile | null>(null);
  const [listOffset, setListOffset] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingRankRef = useRef(1);
  const pendingPersonIdRef = useRef("");
  const moreRequestRef = useRef(false);

  const selectedEvent = WCA_EVENTS.find((event) => event.id === eventId) ?? WCA_EVENTS[0];
  const selectedRegion = regions.find((region) => region.id === regionId)?.name?.replace(/^_/, "");
  const scopeLabel = scope === "world" ? "World" : (selectedRegion ?? scope);
  const queryKey = `${eventId}:${rankingType}:${scope}:${regionId}:${startRank}`;

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    fetch("/api/auth/wca/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ profile: WcaProfile | null }>)
      .then((data) => setProfile(data.profile))
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (scope === "world") return;

    let active = true;
    const fallback = scope === "continent" ? FALLBACK_CONTINENTS : FALLBACK_COUNTRIES;
    fetch(`/api/regions?kind=${scope}`)
      .then((response) => response.json() as Promise<{ regions: RegionOption[] }>)
      .then((data) => {
        if (!active) return;
        const nextRegions = data.regions.length ? data.regions : fallback;
        setRegions(nextRegions);
        setRegionId((current) => nextRegions.some((region) => region.id === current) ? current : nextRegions[0]?.id ?? "");
      })
      .catch(() => {
        if (!active) return;
        setRegions(fallback);
        setRegionId(fallback[0]?.id ?? "");
      });

    return () => { active = false; };
  }, [scope]);

  useEffect(() => {
    const measure = () => setListOffset(listRef.current?.offsetTop ?? 0);
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [loading, queryKey]);

  useEffect(() => {
    if (scope !== "world" && !regionId) return;
    let active = true;

    // This reset is intentionally coupled to the external page request below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setEntries([]);
    setNextPageStart(null);
    setHasMore(true);
    setError("");
    moreRequestRef.current = false;
    window.scrollTo({ top: Math.max(0, (listRef.current?.offsetTop ?? 0) - 120), behavior: "auto" });

    getRankingPage({ eventId, rankingType, scope, regionId, pageStart: startRank })
      .then((data) => {
        if (!active) return;
        setEntries(data.entries);
        setNextPageStart(data.hasMore ? startRank + PAGE_SIZE : null);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setSource(data.source);
        const targetRank = pendingRankRef.current;
        const targetPersonId = pendingPersonIdRef.current;
        const targetIndex = targetPersonId
          ? data.entries.findIndex((entry) => entry.personId === targetPersonId)
          : data.entries.findIndex((entry) => entry.rank >= targetRank);
        scrollToListIndex(listRef.current, targetIndex);
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [queryKey, eventId, rankingType, scope, regionId, startRank]);

  const loadMore = useCallback(async () => {
    if (!nextPageStart || !hasMore || moreRequestRef.current || loading) return;
    moreRequestRef.current = true;
    setLoadingMore(true);
    const requestedPageStart = nextPageStart;

    try {
      const data = await getRankingPage({
        eventId,
        rankingType,
        scope,
        regionId,
        pageStart: requestedPageStart,
      });
      setEntries((current) => {
        const merged = new Map(current.map((entry) => [entry.personId, entry]));
        for (const entry of data.entries) merged.set(entry.personId, entry);
        return [...merged.values()];
      });
      setNextPageStart(data.hasMore ? requestedPageStart + PAGE_SIZE : null);
      setHasMore(data.hasMore);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more rankings.");
    } finally {
      moreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [eventId, hasMore, loading, nextPageStart, rankingType, regionId, scope]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    // Loading the next external page is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - 12) void loadMore();
  }, [entries.length, loadMore, virtualRows]);

  const resetToRank = useCallback((rank: number, highlightedId = "") => {
    const normalizedRank = Math.max(1, rank);
    const nextPageStart = pageStartForRank(normalizedRank);
    pendingRankRef.current = normalizedRank;
    pendingPersonIdRef.current = highlightedId;
    setHighlightId(highlightedId);
    setJumpMessage("");
    if (nextPageStart === startRank) {
      const targetIndex = highlightedId
        ? entries.findIndex((entry) => entry.personId === highlightedId)
        : entries.findIndex((entry) => entry.rank >= normalizedRank);
      if (targetIndex >= 0) scrollToListIndex(listRef.current, targetIndex);
      return;
    }
    setStartRank(nextPageStart);
  }, [entries, startRank]);

  const visibleRank = virtualRows.length && entries[virtualRows[0].index]
    ? entries[virtualRows[0].index].rank
    : startRank;

  const animateJump = (delta: number) => {
    const target = Math.max(1, visibleRank + delta);
    if (target === visibleRank) return;
    setJumpAnimation({ from: visibleRank, to: target });
    window.setTimeout(() => {
      resetToRank(target);
      setJumpAnimation(null);
    }, 560);
  };

  const locateWcaId = async (wcaId: string) => {
    const normalized = wcaId.trim().toUpperCase();
    if (!/^\d{4}[A-Z]{4}\d{2}$/.test(normalized)) {
      setJumpMessage("Use a WCA ID like 2012PARK03.");
      return;
    }
    setJumpMessage("Finding competitor…");
    const parameters = new URLSearchParams({
      event: eventId,
      type: rankingType,
      scope,
      region: regionId,
      locate: normalized,
    });

    try {
      const response = await fetch(`/api/rankings?${parameters}`);
      const data = await response.json() as { located: RankingEntry | null };
      if (!data.located) {
        setJumpMessage(`${normalized} has no ${selectedEvent.shortName} ${rankingType} ranking here.`);
        return;
      }
      setJumpId(normalized);
      resetToRank(data.located.rank, normalized);
    } catch {
      setJumpMessage("That lookup did not finish. Try again.");
    }
  };

  const handleJumpSubmit = (event: FormEvent) => {
    event.preventDefault();
    void locateWcaId(jumpId);
  };

  const summary = useMemo(() => {
    const formattedTotal = total ? new Intl.NumberFormat("en-US").format(total) : "—";
    return `${rankingType === "average" && eventId === "333fm" ? "Mean" : rankingType} · ${scopeLabel} · ${formattedTotal}`;
  }, [eventId, rankingType, scopeLabel, total]);

  return (
    <main className="site-shell">
      <header className="app-header" id="top">
        <div className="header-inner">
          <div className="header-brand-row">
            <a className="brand" href="#rankings" aria-label="CubeRanks rankings">
              <CubeMark />
              <span>Cube<span>Ranks</span></span>
            </a>
            <span className={`data-status data-status-${source}`} title={source === "wca" ? "WCA data live" : "Preview data"}>
              <i />{source === "wca" ? "Live" : "Preview"}
            </span>
            {profile ? (
              <div className="profile-menu">
                <button type="button" onClick={() => void locateWcaId(profile.wcaId)} title={`Jump to ${profile.wcaId}`}>
                  {/* The WCA avatar URL is user-specific and outside the static image optimizer allowlist. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile.name.charAt(0)}</span>}
                  <span className="profile-name">My rank</span>
                </button>
                <a href="/api/auth/wca/logout" aria-label="Sign out">↗</a>
              </div>
            ) : (
              <a className="signin-link" href="/api/auth/wca">WCA sign in</a>
            )}
          </div>

          <div className="header-controls" aria-label="Ranking controls">
            <label className="compact-select event-control">
              <span className="sr-only">Event</span>
              <select value={eventId} onChange={(event) => { setEventId(event.target.value); resetToRank(1); }}>
                {WCA_EVENTS.map((event) => <option value={event.id} key={event.id}>{event.shortName}</option>)}
              </select>
            </label>

            <div className="compact-toggle" role="group" aria-label="Result type">
              {(["single", "average"] as RankingType[]).map((type) => (
                <button
                  className={rankingType === type ? "active" : ""}
                  type="button"
                  aria-pressed={rankingType === type}
                  onClick={() => { setRankingType(type); resetToRank(1); }}
                  key={type}
                >
                  {type === "single" ? "Single" : (eventId === "333fm" ? "Mean" : "Average")}
                </button>
              ))}
            </div>

            <label className="compact-select scope-control">
              <span className="sr-only">Region type</span>
              <select value={scope} onChange={(event) => {
                const nextScope = event.target.value as RegionScope;
                setScope(nextScope);
                if (nextScope === "world") {
                  setRegions([]);
                  setRegionId("");
                }
                resetToRank(1);
              }}>
                <option value="world">World</option>
                <option value="continent">Continent</option>
                <option value="country">Country</option>
              </select>
            </label>

            {scope !== "world" && (
              <label className="compact-select place-control">
                <span className="sr-only">Choose {scope}</span>
                <select value={regionId} onChange={(event) => { setRegionId(event.target.value); resetToRank(1); }}>
                  {regions.map((region) => <option value={region.id} key={region.id}>{region.name.replace(/^_/, "")}</option>)}
                </select>
              </label>
            )}

            <form className="header-jump" onSubmit={handleJumpSubmit}>
              <label className="sr-only" htmlFor="jump-id">Jump to WCA ID</label>
              <input
                id="jump-id"
                value={jumpId}
                onChange={(event) => setJumpId(event.target.value.toUpperCase())}
                placeholder="WCA ID"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={10}
              />
              <button type="submit" aria-label="Find WCA ID">→</button>
            </form>

            <div className="rank-jumps" aria-label="Quick ranking jumps">
              <button type="button" onClick={() => animateJump(-10_000)} disabled={visibleRank <= 1}>−10k</button>
              <button type="button" onClick={() => animateJump(10_000)}>+10k</button>
            </div>
          </div>
        </div>
        {jumpMessage && <div className="header-message" role="status">{jumpMessage}</div>}
      </header>

      <section className="rankings-page" id="rankings" aria-label="WCA ranking explorer">
        <header className="list-summary">
          <div>
            <h1>{selectedEvent.name}</h1>
            <p>{summary}{startRank > 1 ? ` · from #${startRank.toLocaleString()}` : ""}</p>
          </div>
        </header>

        <div className="table-heading" aria-hidden="true">
          <span>Rank</span><span>Competitor</span><span>Nation</span><span>Result</span>
        </div>

        <div className="ranking-window" ref={listRef} aria-label="Ranking results">
          {loading ? (
            <div className="loading-list" role="status" aria-label="Loading rankings">
              {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
            </div>
          ) : error ? (
            <div className="empty-state"><strong>Rankings are unavailable.</strong><span>{error}</span></div>
          ) : (
            <div className="virtual-list" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {virtualRows.map((virtualRow) => {
                const entry = entries[virtualRow.index];
                const translateY = virtualRow.start - listOffset;
                if (!entry) {
                  return (
                    <div className="loading-row" role="status" key="loading-more" style={{ transform: `translateY(${translateY}px)` }}>
                      {loadingMore ? "Loading more results…" : "Keep scrolling…"}
                    </div>
                  );
                }
                const highlighted = highlightId === entry.personId;
                return (
                  <a
                    className={`ranking-row${highlighted ? " ranking-row-highlighted" : ""}`}
                    href={`https://www.worldcubeassociation.org/persons/${entry.personId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ transform: `translateY(${translateY}px)` }}
                    key={`${entry.rank}-${entry.personId}`}
                    aria-label={`${entry.personName}, rank ${entry.rank}, ${formatWcaResult(eventId, entry.best)}`}
                  >
                    <span className="rank-number"><small>#</small>{entry.rank.toLocaleString()}</span>
                    <span className="competitor-cell">
                      <strong>{entry.personName}</strong>
                      <small>{entry.personId}</small>
                    </span>
                    <span className="nation-cell"><b>{flagEmoji(entry.countryIso2)}</b><span>{entry.countryName}</span></span>
                    <span className="result-cell">{formatWcaResult(eventId, entry.best)}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {jumpAnimation && (
        <div className="jump-overlay" role="status" aria-live="polite">
          <span>Jumping to</span>
          <div className="odometer" key={jumpAnimation.to}><small>#</small>{jumpAnimation.to.toLocaleString()}</div>
          <p>{jumpAnimation.from.toLocaleString()} → {jumpAnimation.to.toLocaleString()}</p>
        </div>
      )}
    </main>
  );
}
