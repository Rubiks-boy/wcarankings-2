"use client";

import { useEffect, useRef, useState } from "react";
import type { RegionOption, RegionSelection } from "../RankingsExplorer/types";

export function RegionPicker({
  options,
  selected,
  onChange,
}: {
  options: RegionOption[];
  selected: RegionSelection;
  onChange: (option: RegionOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedOption =
    options.find(
      (option) =>
        option.scope === selected.scope && option.regionId === selected.regionId,
    ) ?? options[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery),
      )
    : options;
  const continents = filteredOptions.filter(
    (option) => option.scope === "continent",
  );
  const countries = filteredOptions.filter(
    (option) => option.scope === "country",
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const choose = (option: RegionOption) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const renderOption = (option: RegionOption) => (
    <button
      className={`regionOption${selectedOption?.key === option.key ? " isSelected" : ""}`}
      type="button"
      role="option"
      aria-selected={selectedOption?.key === option.key}
      onClick={() => choose(option)}
      key={option.key}
    >
      <span>{option.label}</span>
    </button>
  );

  return (
    <div className="regionPicker" ref={pickerRef}>
      <input
        className="regionPickerTrigger"
        id="region-picker-button"
        type="search"
        ref={searchRef}
        value={open ? query : selectedOption?.label ?? "World"}
        onFocus={() => {
          if (!open) setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery("");
            setOpen(false);
          }
        }}
        aria-label="Region"
        aria-haspopup="listbox"
      />
      {open && (
        <div className="regionPickerMenu" role="listbox" aria-label="Region">
          {filteredOptions.length === 0 ? (
            <div className="regionEmpty">No matching regions</div>
          ) : (
            <div className="regionOptions">
              {options[0] && renderOption(options[0])}
              {continents.length > 0 && (
                <div className="regionGroupLabel">Continents</div>
              )}
              {continents.map(renderOption)}
              {countries.length > 0 && (
                <div className="regionGroupLabel">Countries</div>
              )}
              {countries.map(renderOption)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
