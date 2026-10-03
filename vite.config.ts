import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { lockBuildOutput, readReleaseFeed } from "./scripts/releases.ts";

export default defineConfig(async ({ command }) => {
  const releases = await readReleaseFeed(import.meta.dirname);
  const feed = JSON.stringify(releases);
  let unlock = () => Promise.resolve();
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "release-feed",
        async buildStart() {
          if (command === "build")
            unlock = await lockBuildOutput(import.meta.dirname);
        },
        async buildEnd(error: Error | undefined) {
          if (error) await unlock();
        },
        async closeBundle() {
          await unlock();
        },
        resolveId(id: string) {
          if (id === "virtual:releases") return "\0virtual:releases";
        },
        load(id: string) {
          if (id === "\0virtual:releases")
            return `export const releases = ${feed};`;
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "release-manifest.json",
            source: JSON.stringify({
              releaseId:
                process.env["RIVALS_RELEASE_TOKEN"] ??
                releases[0]?.id ??
                "unrecorded",
              releases,
            }),
          });
        },
      },
      cloudflare(),
    ],
    publicDir: "static",
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
  };
});
