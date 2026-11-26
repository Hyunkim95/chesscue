import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./extension/manifest.json" with { type: "json" };
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  build:
    mode === "extension"
      ? {
          outDir: "extension/dist",
          rolldownOptions: {
            input: {
              index: "index.html",
              action: "src/extension/action.ts",
              "lichess-page": "src/extension/lichess-page.ts",
            },
            output: {
              entryFileNames: (chunk) =>
                chunk.name === "index"
                  ? "assets/[name]-[hash].js"
                  : "[name].js",
            },
          },
        }
      : {},
  plugins: [
    react(),
    mode === "extension"
      ? {
          name: "chesscue-extension",
          generateBundle() {
            this.emitFile({
              type: "asset",
              fileName: "chesscue.png",
              source: readFileSync(
                new URL("./extension/chesscue.png", import.meta.url),
              ),
            });
            this.emitFile({
              type: "asset",
              fileName: "manifest.json",
              source: JSON.stringify(manifest, null, 2),
            });
          },
        }
      : VitePWA({
          registerType: "prompt",
          injectRegister: "auto",
          manifest: {
            name: "ChessCue",
            short_name: "ChessCue",
            description:
              "ChessCue turns complete chess games into adaptive training.",
            theme_color: "#091715",
            background_color: "#071513",
            display: "standalone",
            start_url: "/",
            scope: "/",
            icons: [
              {
                src: "/icons/chess-tutor.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose: "any maskable",
              },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            clientsClaim: false,
            skipWaiting: false,
            navigateFallback: "/index.html",
            navigateFallbackDenylist: [/^\/__\/auth\//],
            globPatterns: [
              "**/*.{html,js,css,svg,webp,webmanifest,wasm,woff2,txt,md}",
            ],
          },
        }),
  ],
  worker: {
    format: "es",
  },
}));
