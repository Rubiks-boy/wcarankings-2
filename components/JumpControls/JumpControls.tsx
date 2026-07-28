"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import { formatRankingNumber } from "../RankingsExplorer/types";

type EventOption = {
  id: string;
  name: string;
};

export function JumpControls({
  direction,
  visible,
  armed,
  currentPosition,
  total,
  onJump,
  searchControl,
  searchActive,
  onSearchPrevious,
  onSearchNext,
  eventIcon,
  eventLabel,
  eventOptions,
  onEventChange,
}: {
  direction: "up" | "down";
  visible: boolean;
  armed: boolean;
  currentPosition: number;
  total: number;
  onJump: () => void;
  searchControl?: ReactNode;
  searchActive?: boolean;
  onSearchPrevious?: () => void;
  onSearchNext?: () => void;
  eventIcon?: string;
  eventLabel?: string;
  eventOptions?: readonly EventOption[];
  onEventChange?: (eventId: string) => void;
}) {
  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const nearEdge =
    direction === "up"
      ? currentPosition <= 5000
      : Number.isFinite(total) && currentPosition >= total - 5000;
  let label = `Jump ${formatRankingNumber(5000)}`;
  if (armed || nearEdge) label = direction === "up" ? "Jump to top" : "Jump to end";
  const searchNavigation =
    searchActive && onSearchPrevious !== undefined && onSearchNext !== undefined;

  return (
    <div className={`Jump Jump--${direction}${visible ? " visible" : ""}`}>
      <div
        className={`Jump-rail${searchControl ? "" : " Jump-rail--single"}${
          eventIcon ? " Jump-rail--withEvent" : ""
        }${searchNavigation ? " Jump-rail--searchNavigation" : ""
        }`}
      >
        {eventIcon && onEventChange && eventOptions && (
          <button
            className={`Jump-eventPreview cubing-icon event-${eventIcon}`}
            aria-label={eventLabel}
            title={eventLabel}
            aria-haspopup="listbox"
            aria-expanded={eventMenuOpen}
            type="button"
            onClick={() => setEventMenuOpen((open) => !open)}
          />
        )}
        <button
          className={`Jump-button${searchNavigation ? " isCollapsed" : ""}`}
          onClick={onJump}
          type="button"
          disabled={searchNavigation}
          aria-hidden={searchNavigation}
        >
          <Icon name="arrow" direction={direction} />
          <span>{label}</span>
          <Icon name="arrow" direction={direction} />
        </button>
        <div
          className={`Jump-searchNavigation${
            searchNavigation ? " isVisible" : ""
          }`}
          aria-hidden={!searchNavigation}
        >
          <button
            className="Jump-searchNavigationButton"
            onClick={onSearchPrevious}
            type="button"
            disabled={!searchNavigation}
          >
            <Icon name="arrow" direction="up" />
            <span>Previous person</span>
          </button>
          <button
            className="Jump-searchNavigationButton"
            onClick={onSearchNext}
            type="button"
            disabled={!searchNavigation}
          >
            <span>Next person</span>
            <Icon name="arrow" direction="down" />
          </button>
        </div>
        {searchControl}
        {eventMenuOpen && eventOptions && onEventChange && (
          <div className="Jump-eventMenu" role="listbox" aria-label="Choose event">
            {eventOptions.map((event) => (
              <button
                key={event.id}
                className={`Jump-eventOption cubing-icon event-${event.id}${
                  event.id === eventIcon ? " isSelected" : ""
                }`}
                type="button"
                role="option"
                aria-label={event.name}
                aria-selected={event.id === eventIcon}
                title={event.name}
                onClick={() => {
                  onEventChange(event.id);
                  setEventMenuOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
