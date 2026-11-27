import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

for (const [name, routeHash, signedInAction, width] of [
  ["Social", "#races", "Create race", 320],
  ["a race invitation", "#race/extension-sign-in-invite", "Join race", 420],
] as const) {
  test(`Google approval returns to ${name} in the same extension panel`, async () => {
    test.skip(
      process.env.CHESSCUE_EXTENSION_AUTH_E2E !== "true",
      "Requires an extension built for the Firebase Auth emulator with a test OAuth client ID.",
    );
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      viewport: { width, height: 760 },
      args: ["--enable-unsafe-extension-debugging"],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    try {
      const browser = context.browser();
      if (!browser) throw new Error("No extension-capable Chrome connection.");
      const cdp = await browser.newBrowserCDPSession();
      const { id } = await cdp.send("Extensions.loadUnpacked", {
        path: resolve("extension/dist"),
      });
      // The Auth emulator accepts simulated Google ID tokens. In this test only,
      // adapt the access-token request so the actual Firebase SDK can finish sign-in.
      const account = crypto.randomUUID();
      await context.route(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?*",
        async (route) => {
          const input = route.request().postDataJSON() as { postBody: string };
          const credential = new URLSearchParams(input.postBody);
          expect(credential.get("access_token")).toBe(
            "chrome-test-access-token",
          );
          credential.delete("access_token");
          credential.set(
            "id_token",
            JSON.stringify({
              sub: account,
              email: account + "@example.test",
              email_verified: true,
            }),
          );
          await route.continue({
            postData: JSON.stringify({
              ...input,
              postBody: credential.toString(),
            }),
          });
        },
      );
      const page = await context.newPage();
      await page.addInitScript(() => {
        let attempts = 0;
        Object.defineProperty(chrome.identity, "getAuthToken", {
          async value(options: { interactive?: boolean }) {
            if (!options.interactive)
              throw new Error("The player must initiate sign-in");
            attempts += 1;
            if (attempts === 1)
              throw new Error("The user did not approve access.");
            document.documentElement.dataset.googleApprovedAt = String(
              performance.now(),
            );
            return Promise.resolve({ token: "chrome-test-access-token" });
          },
        });
      });
      const url =
        "chrome-extension://" + id + "/index.html?panel=1" + routeHash;
      await page.goto(url);
      const signIn = page.getByRole("button", { name: "Continue with Google" });
      await signIn.click();
      await expect(
        page.getByRole("status").filter({ hasText: "Sign-in cancelled" }),
      ).toBeVisible();
      await expect(page).toHaveURL(url);
      const tabsBefore = context.pages().length;
      await signIn.click();
      await expect(
        page.getByRole("button", { name: signedInAction }),
      ).toBeVisible({ timeout: 5000 });
      expect(
        await page.evaluate(
          () =>
            performance.now() -
            Number(document.documentElement.dataset.googleApprovedAt),
        ),
      ).toBeLessThanOrEqual(5000);
      await expect(page).toHaveURL(url);
      expect(context.pages()).toHaveLength(tabsBefore);
      await page.reload();
      await expect(
        page.getByRole("button", { name: signedInAction }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
