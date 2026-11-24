import { describe, expect, it } from "vitest";

import { loadFirebaseClientConfig } from "./firebase-environment";

const completeEnvironment = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example",
  VITE_FIREBASE_STORAGE_BUCKET: "example.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
  VITE_FIREBASE_APP_ID: "app-id",
};

describe("Firebase environment", () => {
  it("keeps Firebase disabled when no configuration is supplied", () => {
    expect(loadFirebaseClientConfig({})).toEqual({ ok: true, value: null });
  });

  it("rejects partial configuration", () => {
    const result = loadFirebaseClientConfig({
      VITE_FIREBASE_PROJECT_ID: "example",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("partial-configuration");
    }
  });

  it("accepts complete configuration with optional App Check", () => {
    expect(
      loadFirebaseClientConfig({
        ...completeEnvironment,
        VITE_FIREBASE_APP_CHECK_SITE_KEY: "site-key",
      }),
    ).toEqual({
      ok: true,
      value: {
        apiKey: "api-key",
        authDomain: "example.firebaseapp.com",
        projectId: "example",
        storageBucket: "example.firebasestorage.app",
        messagingSenderId: "123",
        appId: "app-id",
        appCheckSiteKey: "site-key",
      },
    });
  });
});
