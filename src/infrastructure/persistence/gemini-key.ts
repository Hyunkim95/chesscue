import { z } from "zod";

// The player's own Gemini API key (owner decision, 28 November 2026): cloud
// Gemini runs only on it, billed to the player. It stays in this browser:
// never synced, logged or sent anywhere but Google's Gemini API.
export const GEMINI_KEY_STORAGE = "gemini-api-key";
export const GEMINI_KEY_CHANGE = "chesscue:gemini-key";

// Google API keys are "AIza" and 35 more URL-safe characters.
export const geminiKey = z.string().regex(/^AIza[0-9A-Za-z_-]{35}$/);

export function readGeminiKey(): string | undefined {
  try {
    return geminiKey.safeParse(localStorage.getItem(GEMINI_KEY_STORAGE)).data;
  } catch {
    return undefined;
  }
}

function changed(): void {
  window.dispatchEvent(new Event(GEMINI_KEY_CHANGE));
}

// false when the text is not a key or the browser blocks storage.
export function saveGeminiKey(text: string): boolean {
  const key = geminiKey.safeParse(text.trim());
  if (!key.success) return false;
  try {
    localStorage.setItem(GEMINI_KEY_STORAGE, key.data);
  } catch {
    return false;
  }
  changed();
  return true;
}

export function forgetGeminiKey(): void {
  try {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    // Nothing was stored.
  }
  changed();
}
