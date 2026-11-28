import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import manifest from "./extension/manifest.json" with { type: "json" };
import { VitePWA } from "vite-plugin-pwa";

function chromeManifest(mode: string) {
  const webClient =
    mode === "extension"
      ? loadEnv(
          mode,
          process.cwd(),
          "VITE_",
        ).VITE_CHROME_EXTENSION_GOOGLE_CLIENT_ID?.trim()
      : undefined;
  if (
    webClient &&
    !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(webClient)
  ) {
    throw new Error(
      "VITE_CHROME_EXTENSION_GOOGLE_CLIENT_ID must be a Google OAuth client ID.",
    );
  }
  return webClient
    ? {
        ...manifest,
        permissions: [...manifest.permissions, "identity"],
        oauth2: {
          client_id: webClient,
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
          ],
        },
      }
    : manifest;
}

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
              "chess-com-page": "src/extension/chess-com-page.ts",
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
              source: JSON.stringify(chromeManifest(mode), null, 2),
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
            // The first install takes control of the open page, so Stockfish
            // and the other precached files load offline in that same visit.
            // Updates still wait for the player (registerType "prompt").
            clientsClaim: true,
            skipWaiting: false,
            navigateFallback: "/index.html",
            navigateFallbackDenylist: [/^\/__\/auth\//],
            globPatterns: [
              "**/*.{html,js,css,svg,webp,webmanifest,wasm,woff2,txt,md}",
              "models/*.{bin,json}",
            ],
            // The board model's int8 weights are 3.3 MB.
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          },
        }),
  ],
  worker: {
    format: "es",
  },
}));
