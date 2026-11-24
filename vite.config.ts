import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "ChessCue",
        short_name: "ChessCue",
        description:
          "ChessCue turns complete chess games into adaptive training.",
        theme_color: "#f8f1e5",
        background_color: "#eee6d7",
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
        globPatterns: ["**/*.{html,js,css,svg,webmanifest,wasm,woff2,txt,md}"],
      },
    }),
  ],
  worker: {
    format: "es",
  },
});
