import { defineConfig, devices } from "@playwright/test";

const accountEmulators = process.env.VITE_ACCOUNT_EMULATORS === "true";
// A worktree sets E2E_PORT to run against its own build: with
// reuseExistingServer, a shared port would test another checkout's build.
const port = Number(process.env.E2E_PORT ?? "4173");
const baseURL = accountEmulators
  ? "http://127.0.0.1:4187"
  : `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: accountEmulators
      ? "pnpm exec vite build --outDir node_modules/.cache/account-preview && pnpm preview --outDir node_modules/.cache/account-preview --host 127.0.0.1 --port 4187 --strictPort"
      : `pnpm build && pnpm preview --host 127.0.0.1 --port ${String(port)} --strictPort`,
    ...(accountEmulators
      ? {
          env: {
            VITE_FIREBASE_PROJECT_ID: "demo-chesscue-account",
            VITE_FIREBASE_API_KEY: "demo-key",
            VITE_FIREBASE_AUTH_DOMAIN: "demo-chesscue-account.firebaseapp.com",
            VITE_FIREBASE_STORAGE_BUCKET: "demo-chesscue-account.appspot.com",
            VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
            VITE_FIREBASE_APP_ID: "1:123:web:demo",
          },
        }
      : {}),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
