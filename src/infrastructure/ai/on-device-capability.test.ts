import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectOnDeviceCapability,
  onDeviceTextOptions,
} from "./on-device-capability";

afterEach(() => {
  Reflect.deleteProperty(window, "LanguageModel");
});

describe("Chrome on-device capability detection", () => {
  it("reports unsupported when the Prompt API is absent", async () => {
    await expect(detectOnDeviceCapability(null)).resolves.toEqual({
      status: "unsupported",
    });
  });

  it("uses the documented text and English capability options", async () => {
    const availability = vi.fn().mockResolvedValue("available");
    Object.defineProperty(window, "LanguageModel", {
      configurable: true,
      value: { availability },
    });

    await expect(detectOnDeviceCapability(window)).resolves.toEqual({
      status: "available",
    });
    expect(availability).toHaveBeenCalledWith(onDeviceTextOptions);
  });

  it("bounds unknown browser values as a detection failure", async () => {
    Object.defineProperty(window, "LanguageModel", {
      configurable: true,
      value: { availability: () => Promise.resolve("future-value") },
    });

    await expect(detectOnDeviceCapability(window)).resolves.toEqual({
      status: "detection-failed",
      message:
        "Chrome returned an unknown on-device availability value: future-value.",
    });
  });

  it("bounds capability exceptions without preventing cloud fallback", async () => {
    Object.defineProperty(window, "LanguageModel", {
      configurable: true,
      value: { availability: () => Promise.reject(new Error("blocked")) },
    });

    await expect(detectOnDeviceCapability(window)).resolves.toEqual({
      status: "detection-failed",
      message: "blocked",
    });
  });
});
