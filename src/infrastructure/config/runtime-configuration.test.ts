import { describe, expect, it } from "vitest";

import {
  defaultRuntimeConfiguration,
  parseRuntimeConfiguration,
} from "./runtime-configuration";

describe("runtime configuration", () => {
  it("accepts the bounded default", () => {
    expect(parseRuntimeConfiguration(defaultRuntimeConfiguration)).toEqual({
      ok: true,
      value: defaultRuntimeConfiguration,
    });
  });

  it("rejects unsafe engine and coaching limits", () => {
    const result = parseRuntimeConfiguration({
      ...defaultRuntimeConfiguration,
      engine: { moveTimeMs: 6000, minimumElo: 2200, maximumElo: 800 },
      coaching: { timeoutMs: 60000, model: "model", promptVersion: "1.0.0" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects configuration fields not defined by the local contract", () => {
    const result = parseRuntimeConfiguration({
      ...defaultRuntimeConfiguration,
      generatedLessonPolicy: "agent-decides",
    });
    expect(result.ok).toBe(false);
  });
});
