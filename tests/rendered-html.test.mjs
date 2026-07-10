import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the CubeRanks product shell", async () => {
  const [component, layout] = await Promise.all([
    readFile(new URL("../app/components/RankingsExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /CubeRanks — WCA rankings at your speed/);
  assert.match(layout, /images:\s*\[\{ url: "\/og\.png"/);
  assert.match(component, /World rankings,/);
  assert.match(component, /Every official result\. Zero digging\./);
  assert.match(component, /Jump to WCA ID/);
  assert.match(component, /Sign in with WCA/);
  assert.doesNotMatch(component, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter artifacts and declares the real product", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RankingsExplorer \/>/);
  assert.match(layout, /title:\s*"CubeRanks/);
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.jump-overlay/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);

  await assert.rejects(
    access(previewRoot),
  );
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});
