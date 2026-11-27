import { z } from "zod";

export function usesExtensionGoogleSignIn() {
  return (
    location.protocol === "chrome-extension:" &&
    typeof chrome.runtime.getManifest().oauth2?.client_id === "string" &&
    typeof chrome.identity !== "undefined" &&
    typeof chrome.identity.getAuthToken === "function"
  );
}

const tokenSchema = z.object({ token: z.string().min(1) });

export async function requestGoogleAccessToken() {
  if (!navigator.onLine) throw new Error("Connect to the internet to sign in.");
  let result: unknown;
  try {
    result = await chrome.identity.getAuthToken({ interactive: true });
  } catch (error) {
    if (
      error instanceof Error &&
      /did not approve|cancel(?:l?ed)?|user rejected/i.test(error.message)
    ) {
      throw new Error("Sign-in cancelled. You can try again.", {
        cause: error,
      });
    }
    throw new Error("Chrome could not start Google sign-in. Try again.", {
      cause: error,
    });
  }
  const parsed = tokenSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error("Chrome did not return a Google credential. Try again.");
  }
  return parsed.data.token;
}
