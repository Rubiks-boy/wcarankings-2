"use client";

import { TextDropdown } from "../Dropdown/TextDropdown";

export const EXPLORER_SUBJECTS = [
  { id: "people", label: "Persons" },
  { id: "competitions", label: "Competitions" },
] as const;

export type ExplorerSubject = "people" | "results" | "competitions";

export function ExplorerSubjectSwitch({
  subject,
  onChange,
  variant = "segmented",
}: {
  subject: ExplorerSubject;
  onChange: (subject: ExplorerSubject) => void;
  variant?: "segmented" | "select" | "text";
}) {
  if (variant === "text") {
    return (
      <TextDropdown
        options={EXPLORER_SUBJECTS.map((option) => ({ value: option.id, label: option.label }))}
        value={subject}
        onChange={onChange}
        ariaLabel="Browse"
      />
    );
  }

  if (variant === "select") {
    return (
      <label className={`ExplorerSubjectSelect${variant === "text" ? " ExplorerSubjectSelect--text" : ""}`}>
        <span className="visuallyHidden">Browse</span>
        <select
          value={subject}
          aria-label="Browse"
          onChange={(event) => onChange(event.target.value as ExplorerSubject)}
        >
          {EXPLORER_SUBJECTS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="ExplorerSubjectSwitch" role="tablist" aria-label="Browse">
      {EXPLORER_SUBJECTS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={subject === option.id}
          className={subject === option.id ? "isSelected" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
