import { expect, it } from "vitest";
import { rankForElo } from "./rank-path";
it("uses the prototype's exact thresholds on promotions and demotions", () => {
  expect(
    [1149, 1150, 1350, 1450, 1549, 1550, 1749, 1750, 2000].map(
      (n) => rankForElo(n).name,
    ),
  ).toEqual([
    "Copper",
    "Jade",
    "Sapphire",
    "Sapphire",
    "Sapphire",
    "Amethyst",
    "Amethyst",
    "Crown",
    "Crown",
  ]);
});
