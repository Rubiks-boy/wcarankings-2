"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RankingControls } from "../RankingControls/RankingControls";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { ViewSwitcher } from "../ViewSwitcher/ViewSwitcher";
import type { MatrixPage } from "@/lib/ranking-matrix";
import type { RankingView } from "@/lib/ranking-views";
import { WCA_EVENTS, flagEmoji, type RankingType } from "@/lib/wca";
import { formatFetchedAgo, type RegionOption, type RegionSelection } from "../RankingsExplorer/types";

function updateUrl(view: RankingView, type: RankingType, region: RegionSelection, search: string) {
  const params = new URLSearchParams({ view });
  if (type !== "single") params.set("result", type);
  if (region.scope !== "world") params.set("region", region.regionId);
  if (search.trim()) params.set("search", search.trim());
  window.history.replaceState(window.history.state, "", `/?${params}`);
}

export function MatrixExplorer({
  initialData,
  initialView,
  initialRankingType,
  initialRegionSelection,
  initialSearch,
  initialRegions,
}: {
  initialData: MatrixPage;
  initialView: Exclude<RankingView, "wca">;
  initialRankingType: RankingType;
  initialRegionSelection: RegionSelection;
  initialSearch: string;
  initialRegions: {
    continents: Array<{ id: string; name: string }>;
    countries: Array<{ id: string; name: string; iso2?: string }>;
  };
}) {
  const [rankingType, setRankingType] = useState<RankingType>(initialRankingType);
  const [region, setRegion] = useState<RegionSelection>(initialRegionSelection);
  const [search, setSearch] = useState(initialSearch);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const firstRequest = useRef(true);
  const regions: RegionOption[] = useMemo(() => [
    { key: "world", scope: "world", regionId: "", label: "World" },
    ...initialRegions.continents.map((item) => ({
      key: `continent:${item.id}`, scope: "continent" as const, regionId: item.id, label: item.name.replace(/^_/, ""),
    })),
    ...initialRegions.countries.map((item) => ({
      key: `country:${item.id}`, scope: "country" as const, regionId: item.id, label: item.name, iso2: item.iso2,
    })),
  ], [initialRegions]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    updateUrl(initialView, rankingType, region, search);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ view: initialView, result: rankingType });
      if (region.scope !== "world") params.set("region", region.regionId);
      if (search.trim()) params.set("search", search.trim());
      fetch(`/api/rankings?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Rankings are unavailable.");
          return response.json() as Promise<MatrixPage>;
        })
        .then(setData)
        .catch((requestError: unknown) => {
          if ((requestError as { name?: string }).name !== "AbortError") setError("Rankings are unavailable.");
        })
        .finally(() => setLoading(false));
    }, search === initialSearch ? 0 : 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [initialSearch, initialView, rankingType, region, search]);

  const kinch = initialView === "kinch";
  const title = kinch ? "Overall Kinch" : "Overall SOR";
  const regionLabel = regions.find((option) => option.scope === region.scope && option.regionId === region.regionId)?.label ?? "World";

  return (
    <div className="app matrixApp">
      <header className="header">
        <div className="headerTopRow">
          <h1 className="title">WCA Rankings</h1>
          <ThemeToggle />
        </div>
        <ViewSwitcher view={initialView} rankingType={rankingType} region={region} />
        <RankingControls
          eventId="333"
          rankingType={rankingType}
          regions={regions}
          regionSelection={region}
          showEvent={false}
          onEventChange={() => undefined}
          onRankingTypeChange={setRankingType}
          onRegionChange={(option) => setRegion({ scope: option.scope, regionId: option.regionId })}
        />
        <label className="matrixSearch">
          <span className="visuallyHidden">Search names or WCA IDs</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search names or WCA IDs"
            type="search"
          />
        </label>
      </header>
      <main className="matrixMain">
        <p className="matrixExplanation">
          {kinch
            ? `Kinch compares each result with the best ${regionLabel} result in that event. Higher is better. ${data.coveragePolicy}; Multi-Blind is excluded while its special encoding is verified.`
            : `Sum of Ranks adds one ${regionLabel} rank per supported event. Lower is better. ${data.coveragePolicy}.`}
        </p>
        {error ? <p className="listMessage">{error}</p> : (
          <div className="matrixScroll" aria-busy={loading}>
            <table className="matrixTable">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col" className="matrixPerson">Competitor</th>
                  <th scope="col" className="matrixOverall">{title}</th>
                  <th scope="col">Coverage</th>
                  {data.supportedEventIds.map((eventId) => (
                    <th key={eventId} scope="col" title={WCA_EVENTS.find((event) => event.id === eventId)?.name}>
                      {WCA_EVENTS.find((event) => event.id === eventId)?.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.personId}>
                    <td>{entry.rank}</td>
                    <th scope="row" className="matrixPerson">
                      <span>{flagEmoji(entry.countryIso2)} {entry.personName}</span>
                      <small>{entry.personId}</small>
                    </th>
                    <td className="matrixOverall">{kinch ? `${entry.overall.toFixed(2)}%` : entry.overall.toLocaleString()}</td>
                    <td>{entry.coverage}/{data.supportedEventIds.length}</td>
                    {data.supportedEventIds.map((eventId) => {
                      const value = entry.eventValues[eventId];
                      return <td key={eventId}>{kinch ? `${value.kinch?.toFixed(1)}%` : value.rank.toLocaleString()}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.entries.length && <p className="listMessage">No competitors have complete coverage for this view.</p>}
          </div>
        )}
      </main>
      <footer className="siteFooter">
        <span>By Adam Walker and Cailyn Sinclair</span>
        <span>{data.fetchedAt ? `fetched ${formatFetchedAgo(data.fetchedAt)}` : "fetched time unavailable"}</span>
      </footer>
    </div>
  );
}
