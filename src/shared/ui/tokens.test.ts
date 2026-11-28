import { expect, it } from "vitest";

import { tokenProperties } from "./tokens";

it("generates one custom property per token", () => {
  const properties = tokenProperties();
  expect(properties.get("--ui-color-brass-dark")).toBe("#a88a5a");
  expect(properties.get("--ui-radius-control")).toBe("14px");
  expect(properties.get("--ui-motion-spring")).toContain("cubic-bezier");
});
