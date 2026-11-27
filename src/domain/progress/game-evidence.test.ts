import { expect, it } from "vitest";

import { gameIdeaEvidence } from "./game-evidence";
import { forkObservation } from "./test-fixtures";

it("reads a missed fork and a played fork from real games", () => {
  expect(
    gameIdeaEvidence([forkObservation("retry"), forkObservation("matched")]),
  ).toMatchObject([
    { unitId: "double-attack", outcome: "missed" },
    { unitId: "double-attack", outcome: "played" },
  ]);
});
