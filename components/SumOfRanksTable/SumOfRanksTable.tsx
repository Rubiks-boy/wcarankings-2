"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flagEmoji, WCA_EVENTS, type RegionScope } from "@/lib/wca";
import { formatExportDate, formatRankingNumber } from "../RankingsExplorer/types";

const PAGE_SIZE = 50;

type SumOfRanksEntry = {
  rank: number;
  personId: string;
  personName: string;
  country: { id: string; name: string; iso2: string };
  score: number;
  coverage: number;
  requiredCoverage: number;
  events: Array<{ eventId: string; rank: number }>;
};

type SumOfRanksResponse = {
  entries: SumOfRanksEntry[];
  context: {
    eventIds: string[];
    direction: "ascending";
  };
  selection: {
    personId: string;
    eligible: boolean;
    coverage: number;
    requiredCoverage: number;
    reason: "incomplete_coverage" | null;
  } | null;
  page: {
    start: number;
    limit: number;
    hasMore: boolean;
    next: { start: number } | null;
  };
  total: number;
  snapshot: { exportDate: string | null; dataVersion: string };
};

type PersonSearchEntry = {
  personId: string;
  name: string;
  country: { id: string; name: string; iso2: string };
};

const responseCache = new Map<string, Promise<SumOfRanksResponse>>();

function metricUrl({
  resultType,
  scope,
  regionId,
  start,
  personId,
}: {
  resultType: "single" | "average";
  scope: RegionScope;
  regionId: string;
  start: number;
  personId?: string;
}) {
  const params = new URLSearchParams({
    eventId: "SOR",
    result: resultType,
    start: String(start),
    limit: String(PAGE_SIZE),
  });
  if (scope !== "world") params.set("region", regionId);
  if (personId) params.set("personId", personId);
  return `/api/rankings/metrics?${params}`;
}

async function fetchMetricPage(url: string) {
  let request = responseCache.get(url);
  if (!request) {
    request = fetch(url).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Sum of Ranks is unavailable.");
      return body as SumOfRanksResponse;
    });
    responseCache.set(url, request);
    request.catch(() => responseCache.delete(url));
  }
  return request;
}

function updatePersonDeepLink(personId: string | null) {
  const url = new URL(window.location.href);
  if (personId) url.searchParams.set("personId", personId);
  else url.searchParams.delete("personId");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

export function SumOfRanksTable({
  resultType,
  regionSelection,
  initialPersonId = "",
}: {
  resultType: "single" | "average";
  regionSelection: { scope: RegionScope; regionId: string };
  initialPersonId?: string;
}) {
  const [entries, setEntries] = useState<SumOfRanksEntry[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [nextStart, setNextStart] = useState<number | null>(1);
  const [total, setTotal] = useState(0);
  const [exportDate, setExportDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const [selection, setSelection] = useState<SumOfRanksResponse["selection"]>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PersonSearchEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestEpochRef = useRef(0);

  const load = useCallback(async ({
    start,
    personId,
    append,
  }: {
    start: number;
    personId?: string;
    append: boolean;
  }) => {
    const epoch = append ? requestEpochRef.current : requestEpochRef.current + 1;
    if (!append) requestEpochRef.current = epoch;
    setLoading(true);
    setError("");
    try {
      const data = await fetchMetricPage(metricUrl({
        resultType,
        ...regionSelection,
        start,
        personId,
      }));
      if (epoch !== requestEpochRef.current) return;
      setEntries((current) => append
        ? [...current, ...data.entries.filter((entry) =>
            !current.some((existing) => existing.personId === entry.personId))]
        : data.entries);
      setEventIds(data.context.eventIds);
      setNextStart(data.page.next?.start ?? null);
      setTotal(data.total);
      setExportDate(data.snapshot.exportDate);
      setSelection(data.selection);
    } catch (loadError) {
      if (epoch === requestEpochRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Sum of Ranks is unavailable.");
      }
    } finally {
      if (epoch === requestEpochRef.current) setLoading(false);
    }
  }, [regionSelection, resultType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load({ start: 1, personId: selectedPersonId || undefined, append: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, selectedPersonId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextStart === null || loading || selectedPersonId) return;
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        void load({ start: nextStart, append: true });
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load, loading, nextStart, selectedPersonId]);

  useEffect(() => {
    const normalized = search.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!normalized) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      try {
        const response = await fetch(
          `/api/people/search?${new URLSearchParams({ q: normalized, limit: "10" })}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Search is unavailable.");
        if (!controller.signal.aborted) setSearchResults(body.entries ?? []);
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(searchError instanceof Error ? searchError.message : "Search is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, normalized ? 300 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const selectPerson = (personId: string) => {
    setSelectedPersonId(personId);
    setSearch("");
    setSearchResults([]);
    updatePersonDeepLink(personId);
  };

  const clearSelection = () => {
    setSelectedPersonId("");
    setSelection(null);
    updatePersonDeepLink(null);
  };

  const eventsById = new Map(WCA_EVENTS.map((event) => [event.id, event]));

  return (
    <section className="sumOfRanks" aria-label="Sum of Ranks">
      <div className="sumOfRanks-summary">
        <div>
          <strong>{formatRankingNumber(total)}</strong> eligible competitors
          <span> · Lower is better · Complete {resultType === "single" ? "17" : "16"}-event coverage required</span>
          {exportDate && <span> · WCA export {formatExportDate(exportDate)}</span>}
        </div>
        <div className="sumOfRanks-search">
          <label>
            <span className="visuallyHidden">Find a competitor in Sum of Ranks</span>
            <input
              value={search}
              placeholder="Find person or WCA ID"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {searchLoading && <span className="sumOfRanks-searchStatus">Searching…</span>}
          {searchResults.length > 0 && (
            <div className="sumOfRanks-searchResults" role="listbox">
              {searchResults.map((person) => (
                <button
                  key={person.personId}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => selectPerson(person.personId)}
                >
                  <span>{flagEmoji(person.country.iso2)}</span>
                  <span><strong>{person.name}</strong><small>{person.personId}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPersonId && (
        <div className="sumOfRanks-selection">
          <span>
            {selection?.eligible
              ? `Showing the page containing ${selectedPersonId}.`
              : `${selectedPersonId} has ${selection?.coverage ?? 0}/${selection?.requiredCoverage ?? eventIds.length} required events and is not eligible.`}
          </span>
          <button type="button" onClick={clearSelection}>Clear person</button>
        </div>
      )}

      {error && <div className="listMessage">{error}</div>}
      {!error && loading && entries.length === 0 && <div className="listMessage">Loading Sum of Ranks…</div>}

      {!error && entries.length > 0 && (
        <div className="sumOfRanks-scroll">
          <table>
            <thead>
              <tr>
                <th className="sumOfRanks-stickyRank">Rank</th>
                <th className="sumOfRanks-stickyPerson">Person</th>
                <th className="sumOfRanks-overall">Overall</th>
                {eventIds.map((eventId) => (
                  <th key={eventId} title={eventsById.get(eventId)?.name ?? eventId}>
                    {eventsById.get(eventId)?.shortName ?? eventId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const eventRanks = new Map(entry.events.map((event) => [event.eventId, event.rank]));
                return (
                  <tr
                    key={entry.personId}
                    data-person-id={entry.personId}
                    className={entry.personId === selectedPersonId ? "isSelected" : ""}
                  >
                    <td className="sumOfRanks-stickyRank">{formatRankingNumber(entry.rank)}</td>
                    <th className="sumOfRanks-stickyPerson" scope="row">
                      <span className="sumOfRanks-personFlag" title={entry.country.name}>
                        {flagEmoji(entry.country.iso2)}
                      </span>
                      <span><strong>{entry.personName}</strong><small>{entry.personId}</small></span>
                    </th>
                    <td className="sumOfRanks-overall">{formatRankingNumber(entry.score)}</td>
                    {eventIds.map((eventId) => (
                      <td key={eventId}>{formatRankingNumber(eventRanks.get(eventId) ?? 0)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div ref={sentinelRef} className="sumOfRanks-sentinel">
        {!selectedPersonId && loading && entries.length > 0 ? "Loading more…" : ""}
      </div>
    </section>
  );
}
