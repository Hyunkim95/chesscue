import { expect, it } from "vitest";

import { echoOf } from "./echo";

it("hears Rook's own line coming back, and nothing else", () => {
  const said = "Qxg5+ checks your king. I have to play Kh8.";
  expect(echoOf("I have to play Kh8", said)).toBe(true);
  expect(echoOf("qxg5 checks your king", said)).toBe(true);
  // A question that borrows Rook's words is still the player's.
  expect(echoOf("why do you have to play Kh8", said)).toBe(false);
  // Short commands are never taken for an echo.
  expect(echoOf("next", "Say next to go on.")).toBe(false);
  expect(echoOf("play Kh8", said)).toBe(false);
});
