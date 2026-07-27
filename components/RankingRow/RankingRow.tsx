import { formatWcaResult } from "@/lib/wca";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";

export function RankingRow({
  entry,
  eventId,
  rankingType,
  loading,
  animationIndex,
  highlighted = false,
  rankIsDuplicate = false,
}: {
  entry: RankingEntry | null;
  eventId: string;
  rankingType: "single" | "average";
  loading: boolean;
  animationIndex: number;
  highlighted?: boolean;
  rankIsDuplicate?: boolean;
}) {
  const style = {
    "--t-animation-delay": `${animationIndex * 10}ms`,
  } as React.CSSProperties;
  const rank = entry?.rank ?? 0;
  const name = entry?.personName ?? "";
  const id = entry?.personId ?? "";

  return (
    <li
      className={`listItem${loading || !entry ? " isLoading" : ""}`}
      style={style}
    >
      <div className="loader" aria-hidden="true">
        <div className="rank loaderBlob" />
        <div className="name loaderBlob" />
        <div className="best loaderBlob" />
      </div>
      <div
        className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}${
          highlighted ? " row--searchMatch" : ""
        }`}
      >
        <span className={`rank${rankIsDuplicate ? " rank--duplicate" : ""}`}>
          {formatRankingNumber(rank)}
        </span>
        <span className="identity">
          <span className="name">{name}</span>
          <span className="wcaId">{id}</span>
        </span>
        <span className="result">
          <span className="best">
            {entry ? formatWcaResult(eventId, entry.best, rankingType) : ""}
          </span>
          {entry?.competitionName && (
            <span className="competitionName" title={entry.competitionName}>
              {entry.competitionName}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
