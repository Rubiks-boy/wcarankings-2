import vinext from "vinext";
import { defineConfig } from "vite";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isStorybook = process.env.STORYBOOK === "true";

export default defineConfig({
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  ssr: {
    external: ["mysql2"],
  },
  plugins: isStorybook ? [] : [vinext()],
});
