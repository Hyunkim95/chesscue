import { expect, test } from "@playwright/test";

test("keeps the installed app and engine available after the network is lost", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are unavailable.");
    }
    await navigator.serviceWorker.ready;
  });

  const onlineTitle = await page.title();
  const onlineEngine = await page.evaluate(async () => {
    const response = await fetch("/stockfish/stockfish-19-lite-single.wasm");
    return {
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    };
  });
  expect(onlineEngine.ok).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(onlineTitle);

  const offlineEngineAvailable = await page.evaluate(async () => {
    const response = await fetch("/stockfish/stockfish-19-lite-single.wasm");
    return response.ok;
  });
  expect(offlineEngineAvailable).toBe(true);
});

test("publishes an installable manifest", async ({ page }) => {
  await page.goto("/");
  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.webmanifest");
    if (!response.ok)
      throw new Error(
        `Manifest request failed with ${String(response.status)}.`,
      );
    return response.json() as Promise<{
      name?: string;
      display?: string;
      start_url?: string;
      icons?: readonly { src?: string; purpose?: string }[];
    }>;
  });

  expect(manifest.name).toBe("Adaptive Chess Tutor");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(
    manifest.icons?.some((icon) => icon.purpose?.includes("maskable")),
  ).toBe(true);
});
