import { readFile } from "node:fs/promises";
import path from "node:path";

const PAGE_ENTRY = "pages/index.tsx";

async function getClientDirectory() {
  const standaloneDirectory = path.join(process.cwd(), "dist/standalone/dist/client");
  try {
    await readFile(path.join(standaloneDirectory, ".vite", "ssr-manifest.json"));
    return standaloneDirectory;
  } catch {
    return path.join(process.cwd(), "dist/client");
  }
}

export async function GET() {
  const clientDirectory = await getClientDirectory();
  const manifest = JSON.parse(
    await readFile(path.join(clientDirectory, ".vite", "ssr-manifest.json"), "utf8"),
  ) as Record<string, string[]>;
  const stylesheet = manifest[PAGE_ENTRY]?.find((file) => file.endsWith(".css"));

  if (!stylesheet) return new Response("Stylesheet unavailable", { status: 500 });

  const css = await readFile(path.join(clientDirectory, stylesheet));
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
