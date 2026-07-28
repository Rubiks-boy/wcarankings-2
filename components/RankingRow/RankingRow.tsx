import { formatWcaResult, flagEmoji, RECORD_BADGE_LABELS } from "@/lib/wca";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";

export function RankingRow({
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
    minHeight: "61.6px",
  } as React.CSSProperties;
  const rank = entry?.rank ?? 0;
  const name = entry?.personName ?? "";
  const id = entry?.personId ?? "";
  const countryName = entry?.countryName || "Country unavailable";
  const countryFlag = flagEmoji(entry?.countryIso2 ?? "");
  const recordBadge = entry?.recordBadges[0];

  return (
    <li
      className={`listItem${loading || !entry ? " isLoading" : ""}`}
      data-person-id={entry?.personId}
      style={style}
    >
      <div className="loader" aria-hidden="true">
        <div className="rank loaderBlob" />
        <div className="name loaderBlob" />
        <div className="best loaderBlob" />
      </div>
      <div
        className={`row${animationIndex % 2 === 1 ? " row--alternate" : ""}${
          searchMatched ? " row--searchResult" : ""
        }${
          highlighted ? " row--searchMatch" : ""
        }`}
      >
        <span className={`rank${rankIsDuplicate ? " rank--duplicate" : ""}`}>
          {formatRankingNumber(rank)}
        </span>
        <span className="identity">
          <span className="personName">
            <span
              className="countryFlag"
              role="img"
              aria-label={countryName}
              title={countryName}
            >
              {countryFlag}
            </span>
            <span className="name">{name}</span>
          </span>
          <span className="wcaId">{id}</span>
        </span>
        <span className="result">
          <span className="resultValue">
            <span className="best">
              {entry ? formatWcaResult(eventId, entry.best, rankingType) : ""}
            </span>
            <span
              className="recordBadges"
              aria-hidden={!recordBadge}
              aria-label={recordBadge ? "Records" : undefined}
            >
              {recordBadge && (
                <span
                  className={`recordBadge recordBadge--${recordBadge}`}
                  role="img"
                  aria-label={RECORD_BADGE_LABELS[recordBadge]}
                  title={RECORD_BADGE_LABELS[recordBadge]}
                >
                  {recordBadge}
                </span>
              )}
            </span>
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
