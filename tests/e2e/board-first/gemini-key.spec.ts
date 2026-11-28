import { expect, test } from "@playwright/test";

// The player's own Gemini key, added in Profile (owner decision,
// 28 November 2026). Google's key check is answered here.
const KEY = "AIza" + "k".repeat(31) + "Q9xz";

for (const width of [320, 420])
  test(`a player adds, keeps and removes their Gemini key at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const checks: (string | null)[] = [];
    let accept = false;
    await page.route("**/v1beta/models?pageSize=1", async (route) => {
      checks.push(await route.request().headerValue("x-goog-api-key"));
      await route.fulfill({
        status: accept ? 200 : 400,
        contentType: "application/json",
        body: JSON.stringify(accept ? { models: [] } : { error: {} }),
      });
    });
    await page.goto("/?ui=board-first#profile");
    const settings = page.getByRole("region", { name: "Settings" });
    await expect(settings).toBeVisible({ timeout: 30_000 });
    await settings.getByRole("button", { name: "Add Gemini key" }).click();

    const field = settings.getByLabel("Your Gemini API key");
    await expect(field).toBeFocused();
    await field.fill(KEY);
    await settings.getByRole("button", { name: "Save" }).click();
    await expect(
      settings.getByText("Google didn't accept this key."),
    ).toBeVisible();
    await expect(field).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("gemini-api-key")),
    ).toBeNull();
    await page.screenshot({
      path: test.info().outputPath(`gemini-key-error-${String(width)}.png`),
    });

    accept = true;
    await settings.getByRole("button", { name: "Save" }).click();
    await expect(settings.getByText("Saved · ends in Q9xz")).toBeVisible();
    expect(checks).toEqual([KEY, KEY]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`gemini-key-saved-${String(width)}.png`),
    });

    await page.reload();
    await expect(settings.getByText("Saved · ends in Q9xz")).toBeVisible({
      timeout: 30_000,
    });
    await settings.getByRole("button", { name: "Remove Gemini key" }).click();
    await expect(
      settings.getByRole("button", { name: "Add Gemini key" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("gemini-api-key")),
    ).toBeNull();
  });
