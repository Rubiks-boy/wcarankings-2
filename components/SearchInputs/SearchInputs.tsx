"use client";

import type { KeyboardEvent, Ref } from "react";
import { Icon } from "../Icon/Icon";
import {
  formatRankingNumber,
  type RankingEntry,
} from "../RankingsExplorer/types";

export function SearchInputs({
  barRef,
  inputRef,
  findOpen,
  findQuery,
  findError,
  findLoading,
  findPending,
  findMatches,
  findIndex,
  activeFindMatch,
  onOpen,
  onClose,
  onQueryChange,
  onCycle,
  inRail = false,
}: {
  barRef?: Ref<HTMLDivElement>;
  inputRef?: Ref<HTMLInputElement>;
  findOpen: boolean;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatches: RankingEntry[];
  findIndex: number;
  activeFindMatch: RankingEntry | null;
  onOpen: () => void;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onCycle: (direction: -1 | 1) => void;
  inRail?: boolean;
}) {
  const searchButton = (
    <button
      className={`searchButton${inRail ? " searchButton--rail" : ""}`}
      type="button"
      onClick={onOpen}
      aria-label="Search names or WCA IDs"
      title="Search names or WCA IDs (Ctrl+F)"
    >
      <Icon name="search" />
    </button>
  );

  if (!findOpen) {
    return searchButton;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCycle(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  let status = "";
  if (findError) status = findError;
  else if (findLoading || findPending) status = "Searching…";
  else if (findQuery.trim()) {
    status = findMatches.length
      ? `${findIndex + 1} of ${findMatches.length}`
      : "No matches";
  }

  const findBar = (
    <div
      ref={barRef}
      className={`findBar${inRail ? " findBar--railOverlay" : ""}`}
      role="search"
    >
      <span className="findIcon" aria-hidden="true">
        <Icon name="search" />
      </span>
      <input
        ref={inputRef}
        className="findInput"
        type="search"
        value={findQuery}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Find a name or WCA ID"
      />
      <span
        className={`findStatus${findError ? " isError" : ""}`}
        aria-live="polite"
      >
        {status}
      </span>
      <button
        className="findClose"
        type="button"
        onClick={onClose}
        aria-label="Close search"
      >
        ×
      </button>
    </div>
  );

  return inRail ? (
    <>
      {searchButton}
      {findBar}
    </>
  ) : (
    findBar
  );
}
