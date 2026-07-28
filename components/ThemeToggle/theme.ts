export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "wca-rankings-theme";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(
  savedTheme: string | null,
  prefersDark: boolean,
): Theme {
  if (isTheme(savedTheme)) return savedTheme;
  return prefersDark ? "dark" : "light";
}
