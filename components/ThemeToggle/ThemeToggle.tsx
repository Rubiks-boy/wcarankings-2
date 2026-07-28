"use client";

import { useEffect, useState } from "react";
import {
  isTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#fffcff",
  dark: "#121417",
};

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    THEME_COLORS[theme],
  );
}

function ThemeIcon({ theme }: { theme: Theme | null }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.6 15.6A8.3 8.3 0 0 1 8.4 3.4 8.3 8.3 0 1 0 20.6 15.6Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const loadTheme = () => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const nextTheme = resolveTheme(savedTheme, media.matches);
      applyTheme(nextTheme);
      setTheme(nextTheme);
      return savedTheme;
    };
    const savedTheme = loadTheme();
    if (isTheme(savedTheme)) return;

    const handleChange = () => {
      applyTheme(media.matches ? "dark" : "light");
      setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = theme
    ? `Switch to ${nextTheme} mode`
    : "Toggle color theme";

  return (
    <button
      className="themeToggle"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const currentTheme = theme ?? resolveTheme(
          window.localStorage.getItem(THEME_STORAGE_KEY),
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        );
        const selectedTheme = currentTheme === "dark" ? "light" : "dark";
        window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
        applyTheme(selectedTheme);
        setTheme(selectedTheme);
      }}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
