"use client";

import type { RankingView } from "@/lib/ranking-views";
import type { RankingType } from "@/lib/wca";
import type { RegionSelection } from "../RankingsExplorer/types";

function hrefFor(
  view: RankingView,
  rankingType: RankingType,
  region: RegionSelection,
) {
  const params = new URLSearchParams();
  if (view !== "wca") params.set("view", view);
  if (rankingType !== "single") params.set("result", rankingType);
  if (region.scope !== "world") params.set("region", region.regionId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function ViewSwitcher({
  view,
  rankingType,
  region,
}: {
  view: RankingView;
  rankingType: RankingType;
  region: RegionSelection;
}) {
  const options: Array<{ view: RankingView; label: string }> = [
    { view: "wca", label: "WCA Rankings" },
    { view: "kinch", label: "Kinch Rankings" },
    { view: "sor", label: "Sum of Ranks" },
  ];

  return (
    <nav className="viewSwitcher" aria-label="Ranking view">
      {options.map((option) => (
        <a
          aria-current={option.view === view ? "page" : undefined}
          className={option.view === view ? "isSelected" : undefined}
          href={hrefFor(option.view, rankingType, region)}
          key={option.view}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}
