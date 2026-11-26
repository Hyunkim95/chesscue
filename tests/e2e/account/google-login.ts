import { expect, type Page } from "@playwright/test";

export async function googleLogin(page: Page, email: string) {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/^http:\/\/127\.0\.0\.1:9099\//);
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill("ChessCue Tester");
  await popup.locator("#sign-in").click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
