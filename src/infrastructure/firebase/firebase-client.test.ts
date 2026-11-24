import { describe, expect, it } from "vitest";

import { initializeFirebaseClient } from "./firebase-client";

describe("optional Firebase client", () => {
  it("stays disabled without configuration and never blocks local play", () => {
    expect(initializeFirebaseClient({ environment: {} })).toEqual({
      status: "disabled",
      reason: "not-configured",
    });
  });

  it("returns a bounded failure for partial configuration", () => {
    const result = initializeFirebaseClient({
      environment: { VITE_FIREBASE_PROJECT_ID: "partial" },
    });
    expect(result.status).toBe("failed");
  });
});
