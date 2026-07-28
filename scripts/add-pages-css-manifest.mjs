import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const clientDirectories = ["dist/client", "dist/standalone/dist/client"];
const cssDirectory = path.join(clientDirectories[0], "assets");
const cssFiles = (await readdir(cssDirectory)).filter((file) => file.endsWith(".css"));

if (cssFiles.length !== 1) {
  throw new Error(`Expected one bundled stylesheet, found ${cssFiles.length}.`);
}

const stylesheet = `assets/${cssFiles[0]}`;
for (const clientDirectory of clientDirectories) {
  const manifestPath = path.join(clientDirectory, ".vite", "ssr-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest["pages/index.tsx"] = [stylesheet];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
