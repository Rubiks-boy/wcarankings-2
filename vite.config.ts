import vinext from "vinext";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isStorybook = process.env.STORYBOOK === "true";

export default defineConfig({
  assetsInclude: ["**/*.woff2"],
  build: {
    ssrManifest: true,
  },
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  ssr: {
    external: ["mysql2"],
  },
  plugins: isStorybook ? [] : [svgr(), vinext()],
});
