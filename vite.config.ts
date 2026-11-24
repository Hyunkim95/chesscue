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
        name: "Adaptive Chess Tutor",
        short_name: "Chess Tutor",
        description:
          "A local-first adaptive chess tutor where complete games shape the curriculum.",
        theme_color: "#101813",
        background_color: "#101813",
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
        globPatterns: ["**/*.{html,js,css,svg,webmanifest,wasm,txt,md}"],
      },
    }),
  ],
  worker: {
    format: "es",
  },
});
