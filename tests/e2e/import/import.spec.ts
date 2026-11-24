import { expect, test } from "@playwright/test";

const foolsMate = `[Event "Imported training game"]
[Site "Local"]
[Date "2026.11.24"]
[Round "1"]
[White "Player"]
[Black "Opponent"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

test("imports a completed PGN and rejects the duplicate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bring games" }).click();

  const input = page.getByLabel("Paste completed PGN games");
  await input.fill(foolsMate);
  await page.getByRole("radio", { name: "I played White" }).check();
  await page.getByRole("button", { name: "Import games" }).click();

  await expect(
    page.getByRole("heading", { name: "1 accepted, 0 duplicate, 0 rejected" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Import more games" }).click();
  await input.fill(foolsMate);
  await page.getByRole("button", { name: "Import games" }).click();

  await expect(
    page.getByRole("heading", { name: "0 accepted, 1 duplicate, 0 rejected" }),
  ).toBeVisible();
});

test("learner-color controls stay accessible on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Bring games" }).click();

  const group = page.getByRole("group", {
    name: "Which side did you play in these games?",
  });
  await expect(group).toBeVisible();
  await expect(
    group.getByRole("radio", { name: "I played White" }),
  ).toBeVisible();
  await expect(
    group.getByRole("radio", { name: "I played Black" }),
  ).toBeVisible();
  await expect(
    page.getByText("Import mixed-color games in separate batches."),
  ).toBeVisible();
});

test("shows the deterministic training plan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Training plan" }).click();

  await expect(
    page.getByRole("heading", { name: "Your Training Profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Predictable by playbook" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play this focus game" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Analyze latest game" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Finish a tutor game or import a completed game with your color before requesting a review.",
  );
});
