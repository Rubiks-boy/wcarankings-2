"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  WCA_EVENTS,
  flagEmoji,
  formatWcaResult,
  type RankingCursor,
  type RankingEntry,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";
import type { WcaProfile } from "@/lib/wca-auth";

type RankingsResponse = {
  entries: RankingEntry[];
  hasMore: boolean;
  nextCursor: RankingCursor | null;
  total: number;
  exportDate: string | null;
  source: "wca" | "demo";
};

type RegionOption = { id: string; name: string };

const PAGE_SIZE = 80;

function CubeMark() {
  const colors = ["lime", "cream", "orange", "cream", "orange", "lime", "orange", "lime", "cream"];
  return (
    <span className="cube-mark" aria-hidden="true">
      {colors.map((color, index) => <span className={`cube-tile cube-tile-${color}`} key={index} />)}
    </span>
  );
}

function SelectorLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <span className="selector-label">
      <span>{number}</span>
      {children}
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
  const [cursor, setCursor] = useState<RankingCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"wca" | "demo">("demo");
  const [exportDate, setExportDate] = useState<string | null>(null);
  const [startRank, setStartRank] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [jumpId, setJumpId] = useState("");
  const [jumpMessage, setJumpMessage] = useState("");
  const [highlightId, setHighlightId] = useState("");
  const [jumpAnimation, setJumpAnimation] = useState<{ from: number; to: number } | null>(null);
  const [profile, setProfile] = useState<WcaProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRequestRef = useRef(false);

  const selectedEvent = WCA_EVENTS.find((event) => event.id === eventId) ?? WCA_EVENTS[0];
  const selectedRegion = regions.find((region) => region.id === regionId)?.name;
  const scopeLabel = scope === "world" ? "World" : (selectedRegion ?? (scope === "continent" ? "Continent" : "Country"));
  const queryKey = `${eventId}:${rankingType}:${scope}:${regionId}:${startRank}`;

  // TanStack Virtual intentionally exposes mutable measurement helpers; the component owns their lifecycle.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 74,
    overscan: 9,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    fetch("/api/auth/wca/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ profile: WcaProfile | null }>)
      .then((data) => setProfile(data.profile))
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (scope === "world") {
      setRegions([]);
      setRegionId("");
      return;
    }

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
    if (scope !== "world" && !regionId) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      event: eventId,
      type: rankingType,
      scope,
      region: regionId,
      start: String(startRank),
      limit: String(PAGE_SIZE),
    });

    setLoading(true);
    setEntries([]);
    setCursor(null);
    setHasMore(true);
    setError("");
    moreRequestRef.current = false;
    scrollRef.current?.scrollTo({ top: 0 });

    fetch(`/api/rankings?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Rankings are unavailable.");
        return response.json() as Promise<RankingsResponse>;
      })
      .then((data) => {
        setEntries(data.entries);
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setSource(data.source);
        setExportDate(data.exportDate);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [queryKey, eventId, rankingType, scope, regionId, startRank]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || moreRequestRef.current || loading) return;
    moreRequestRef.current = true;
    setLoadingMore(true);
    const parameters = new URLSearchParams({
      event: eventId,
      type: rankingType,
      scope,
      region: regionId,
      start: String(startRank),
      cursorRank: String(cursor.rank),
      cursorId: cursor.personId,
      limit: String(PAGE_SIZE),
    });

    try {
      const response = await fetch(`/api/rankings?${parameters}`);
      if (!response.ok) throw new Error("Could not load more rankings.");
      const data = await response.json() as RankingsResponse;
      setEntries((current) => {
        const merged = new Map(current.map((entry) => [entry.personId, entry]));
        for (const entry of data.entries) merged.set(entry.personId, entry);
        return [...merged.values()];
      });
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more rankings.");
    } finally {
      moreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor, eventId, hasMore, loading, rankingType, regionId, scope, startRank]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - 12) void loadMore();
  }, [entries.length, loadMore, virtualRows]);

  const resetToRank = useCallback((rank: number, highlightedId = "") => {
    setStartRank(Math.max(1, rank));
    setHighlightId(highlightedId);
    setJumpMessage("");
  }, []);

  const animateJump = (delta: number) => {
    const visibleRank = virtualRows.length && entries[virtualRows[0].index]
      ? entries[virtualRows[0].index].rank
      : startRank;
    const target = Math.max(1, visibleRank + delta);
    if (target === visibleRank) return;
    setJumpAnimation({ from: visibleRank, to: target });
    window.setTimeout(() => {
      resetToRank(target);
      setJumpAnimation(null);
    }, 720);
  };

  const locateWcaId = async (wcaId: string) => {
    const normalized = wcaId.trim().toUpperCase();
    if (!/^\d{4}[A-Z]{4}\d{2}$/.test(normalized)) {
      setJumpMessage("Use a WCA ID like 2012PARK03.");
      return;
    }
    setJumpMessage("Finding that competitor…");
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
      setJumpMessage("That lookup did not finish. Please try again.");
    }
  };

  const handleJumpSubmit = (event: FormEvent) => {
    event.preventDefault();
    void locateWcaId(jumpId);
  };

  const summary = useMemo(() => {
    const formattedTotal = total ? new Intl.NumberFormat("en-US").format(total) : "—";
    return `${formattedTotal} ranked competitors`;
  }, [total]);

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="CubeRanks home">
          <CubeMark />
          <span>Cube<span>Ranks</span></span>
        </a>
        <div className="topbar-meta">
          <span className={`data-status data-status-${source}`}>
            <span />
            {source === "wca" ? "WCA data live" : "Preview data"}
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
            <a className="signin-link" href="/api/auth/wca">Sign in with WCA <span>↗</span></a>
          )}
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-kicker"><span>01</span> Every official result. Zero digging.</div>
        <div className="hero-heading-row">
          <h1>World rankings,<br /><em>at your speed.</em></h1>
          <p>Explore every official WCA ranking in a fast, focused view built for thumbs, keyboards, and deep dives.</p>
        </div>
      </section>

      <section className="ranking-workspace" aria-label="WCA ranking explorer">
        <div className="control-deck">
          <div className="selector selector-event">
            <label htmlFor="event-select"><SelectorLabel number="01">Event</SelectorLabel></label>
            <div className="select-wrap">
              <select id="event-select" value={eventId} onChange={(event) => { setEventId(event.target.value); setStartRank(1); }}>
                {WCA_EVENTS.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}
              </select>
            </div>
          </div>

          <div className="selector">
            <SelectorLabel number="02">Result</SelectorLabel>
            <div className="segmented-control" role="group" aria-label="Result type">
              {(["single", "average"] as RankingType[]).map((type) => (
                <button
                  className={rankingType === type ? "active" : ""}
                  type="button"
                  aria-pressed={rankingType === type}
                  onClick={() => { setRankingType(type); setStartRank(1); }}
                  key={type}
                >
                  {type === "single" ? "Single" : (eventId === "333fm" ? "Mean" : "Average")}
                </button>
              ))}
            </div>
          </div>

          <div className="selector selector-region">
            <SelectorLabel number="03">Region</SelectorLabel>
            <div className="region-controls">
              <div className="segmented-control" role="group" aria-label="Ranking region">
                {(["world", "continent", "country"] as RegionScope[]).map((option) => (
                  <button
                    className={scope === option ? "active" : ""}
                    type="button"
                    aria-pressed={scope === option}
                    onClick={() => { setScope(option); setStartRank(1); }}
                    key={option}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
              {scope !== "world" && (
                <div className="select-wrap region-select-wrap">
                  <select aria-label={`Choose ${scope}`} value={regionId} onChange={(event) => { setRegionId(event.target.value); setStartRank(1); }}>
                    {regions.map((region) => <option value={region.id} key={region.id}>{region.name.replace(/^_/, "")}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="results-card">
          <header className="results-header">
            <div>
              <div className="results-breadcrumb">
                <span>{selectedEvent.shortName}</span><i>/</i><span>{rankingType}</span><i>/</i><strong>{scopeLabel}</strong>
              </div>
              <p>{summary}{startRank > 1 ? ` · starting near #${startRank.toLocaleString()}` : ""}</p>
            </div>
            <form className="jump-form" onSubmit={handleJumpSubmit}>
              <label htmlFor="jump-id">Jump to WCA ID</label>
              <div>
                <input
                  id="jump-id"
                  value={jumpId}
                  onChange={(event) => setJumpId(event.target.value.toUpperCase())}
                  placeholder="2012PARK03"
                  inputMode="text"
                  autoCapitalize="characters"
                  maxLength={10}
                />
                <button type="submit" aria-label="Find WCA ID">→</button>
              </div>
              {jumpMessage && <span role="status">{jumpMessage}</span>}
            </form>
          </header>

          <div className="table-heading" aria-hidden="true">
            <span>Rank</span><span>Competitor</span><span>Nation</span><span>Result</span>
          </div>

          <div className="ranking-scroll" ref={scrollRef} tabIndex={0} aria-label="Ranking results">
            {loading ? (
              <div className="loading-list" role="status" aria-label="Loading rankings">
                {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
              </div>
            ) : error ? (
              <div className="empty-state"><strong>Rankings took a wrong turn.</strong><span>{error}</span></div>
            ) : (
              <div className="virtual-list" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {virtualRows.map((virtualRow) => {
                  const entry = entries[virtualRow.index];
                  if (!entry) {
                    return (
                      <div className="loading-row" role="status" key="loading-more" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                        {loadingMore ? "Loading more official results…" : "Keep scrolling…"}
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
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
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

          <div className="jump-rail" aria-label="Quick ranking jumps">
            <button type="button" onClick={() => animateJump(-10_000)} disabled={startRank === 1}>
              <span>↑</span><strong>10K</strong><small>Jump up</small>
            </button>
            <div><span>Fast lane</span><i /></div>
            <button type="button" onClick={() => animateJump(10_000)}>
              <span>↓</span><strong>10K</strong><small>Jump down</small>
            </button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div><CubeMark /><span>Built for the cubing community.</span></div>
        <p>
          This independent site uses competition results owned and maintained by the World Cube Association.
          {exportDate ? ` Data current to ${new Date(exportDate).toLocaleDateString("en-US", { dateStyle: "medium" })}.` : " Connect the WCA export to replace preview rows."}
        </p>
        <a href="https://www.worldcubeassociation.org/export/results" target="_blank" rel="noreferrer">Data source ↗</a>
      </footer>

      {jumpAnimation && (
        <div className="jump-overlay" role="status" aria-live="polite">
          <div className="jump-tunnel" />
          <span>Express jump</span>
          <div className="odometer" key={jumpAnimation.to}>
            <small>#</small>{jumpAnimation.to.toLocaleString()}
          </div>
          <p>{jumpAnimation.from.toLocaleString()} → {jumpAnimation.to.toLocaleString()}</p>
        </div>
      )}
    </main>
  );
}
