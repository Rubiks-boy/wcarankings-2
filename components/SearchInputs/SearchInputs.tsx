"use client";

import type { FocusEvent, KeyboardEvent, Ref } from "react";
import { Icon } from "../Icon/Icon";
import {
  formatRankingNumber,
  type RankingEntry,
} from "../RankingsExplorer/types";

export function SearchInputs({
  barRef,
  findOpen,
  findFloating,
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
}: {
  barRef?: Ref<HTMLDivElement>;
  findOpen: boolean;
  findFloating: boolean;
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
}) {
  if (!findOpen) {
    return (
      <button
        className={`searchButton${
          findFloating ? " searchButton--floating" : ""
        }`}
        type="button"
        onClick={onOpen}
        aria-label="Search names or WCA IDs"
        title="Search names or WCA IDs (Ctrl+F)"
      >
        <Icon name="search" />
      </button>
    );
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onClose();
    }
  };
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

  return (
    <div
      ref={barRef}
      className={`findBar${findFloating ? " findBar--floating" : ""}`}
      role="search"
      onBlur={handleBlur}
    >
      <span className="findIcon" aria-hidden="true">
        <Icon name="search" />
      </span>
      <input
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
}
