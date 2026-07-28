"use client";

import { WCA_EVENTS } from "@/lib/wca";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import type { RegionOption, RegionSelection } from "../RankingsExplorer/types";

export function RankingControls({
  eventId,
  rankingType,
  regions,
  regionSelection,
  onEventChange,
  onRankingTypeChange,
  onRegionChange,
}: {
  eventId: (typeof WCA_EVENTS)[number]["id"];
  rankingType: "single" | "average";
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onEventChange: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  onRegionChange: (region: RegionOption) => void;
}) {
  return (
    <div className="chooser">
      <div className="selectInput eventInput">
        <select
          name="Event Id"
          onChange={(event) =>
            onEventChange(event.target.value as (typeof WCA_EVENTS)[number]["id"])
          }
          value={eventId}
        >
          {WCA_EVENTS.map(({ id, shortName }) => (
            <option key={id} value={id}>
              {shortName}
            </option>
          ))}
        </select>
        <SelectChevronIcon />
      </div>
      <fieldset className="rankingTypeToggle" aria-label="Ranking type">
        <legend className="visuallyHidden">Ranking type</legend>
        {(["single", "average"] as const).map((option) => (
          <label
            className={`rankingTypeOption${rankingType === option ? " isSelected" : ""}${
              option === "average" && eventId === "333mbf" ? " isDisabled" : ""
            }`}
            key={option}
          >
            <input
              type="radio"
              name="Ranking type"
              value={option}
              checked={rankingType === option}
              disabled={option === "average" && eventId === "333mbf"}
              onChange={() => onRankingTypeChange(option)}
            />
            <span>{option === "single" ? "Single" : "Average"}</span>
          </label>
        ))}
      </fieldset>
      {regions.length > 0 && (
        <RegionPicker
          options={regions}
          selected={regionSelection}
          onChange={onRegionChange}
        />
      )}
    </div>
  );
}
