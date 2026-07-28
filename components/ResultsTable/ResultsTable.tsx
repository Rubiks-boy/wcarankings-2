import { RankingRow } from "../RankingRow/RankingRow";
import type { RankingEntry } from "../RankingsExplorer/types";
import type { Key, Ref } from "react";

export type RenderedTableRow = {
  index: number;
  key: Key;
  start: number;
};

export function ResultsTable({
  entries,
  listRef,
  renderedRows,
  renderedListHeight,
  listOffset,
  eventId,
  rankingType,
  loading,
  preserveListDuringLoad,
  loadingMore,
  highlightedPersonId,
  searchMatchPersonIds,
  measureElement,
}: {
  entries: RankingEntry[];
  listRef?: Ref<HTMLOListElement>;
  renderedRows: RenderedTableRow[];
  renderedListHeight: number;
  listOffset: number;
  eventId: string;
  rankingType: "single" | "average";
  loading: boolean;
  preserveListDuringLoad: boolean;
  loadingMore: boolean;
  highlightedPersonId: string;
  searchMatchPersonIds?: ReadonlySet<string>;
  measureElement: (element: Element | null) => void;
}) {
  if (loading && !preserveListDuringLoad) {
    return (
      <ol className="list loadingList">
        {Array.from({ length: 10 }, (_, index) => (
          <RankingRow
            key={index}
            entry={null}
            eventId={eventId}
            rankingType={rankingType}
            loading
            animationIndex={index}
          />
        ))}
      </ol>
    );
  }

  return (
    <ol
      ref={listRef}
      className="list"
      style={{ height: `${renderedListHeight}px` }}
    >
      {renderedRows.map((virtualRow) => {
        const entry = entries[virtualRow.index] ?? null;
        return (
          <div
            ref={measureElement}
            className="virtualRow"
            key={virtualRow.key}
            data-index={virtualRow.index}
            style={{
              transform: `translateY(${virtualRow.start - listOffset}px)`,
            }}
          >
            {entry ? (
              <RankingRow
                entry={entry}
                eventId={eventId}
                rankingType={rankingType}
                loading={false}
                animationIndex={virtualRow.index}
                searchMatched={searchMatchPersonIds?.has(entry.personId)}
                highlighted={entry.personId === highlightedPersonId}
                rankIsDuplicate={
                  virtualRow.index > 0 &&
                  entries[virtualRow.index - 1]?.rank === entry.rank
                }
              />
            ) : (
              <div className="listMessage">
                {loadingMore ? "Loading more results…" : "Keep scrolling…"}
              </div>
            )}
          </div>
        );
      })}
    </ol>
  );
}
