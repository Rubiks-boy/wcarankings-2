import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./ThemeToggle";
import { resolveTheme, THEME_STORAGE_KEY } from "./theme";

test("resolves saved and system color preferences", () => {
  assert.equal(THEME_STORAGE_KEY, "wca-rankings-theme");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme(null, true), "dark");
});

test("renders an accessible theme toggle", () => {
  const markup = renderToStaticMarkup(<ThemeToggle />);
  assert.match(markup, /class="themeToggle"/);
  assert.match(markup, /aria-label="Toggle color theme"/);
  assert.match(markup, /type="button"/);
});
