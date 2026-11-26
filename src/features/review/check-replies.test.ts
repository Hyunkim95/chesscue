import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { compareCheckReplies } from "./check-replies";

it("explains the material lost even when a capture can be answered", () => {
  const position = new Chess("4kr2/1b6/8/8/8/6Q1/5KP1/8 w - - 0 1");
  const options = compareCheckReplies(position)?.options;
  expect(options?.find(({ san }) => san === "Qf3")?.explanation).toContain(
    "you give up a queen for a rook",
  );
});
