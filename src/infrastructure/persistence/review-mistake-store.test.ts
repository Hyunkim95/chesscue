import "fake-indexeddb/auto";
import { Chess } from "chess.js";
import { expect, it } from "vitest";

import {
  reviewMistakeId,
  reviewMistakePractice,
} from "../../domain/analysis/review-mistake";
import { deleteChessTutorDatabase } from "./chess-tutor-database";
import {
  completeReviewMistake,
  listReviewMistakes,
  saveReviewMistake,
} from "./review-mistake-store";

it("keeps a completed review retry complete after the same position is tried again", async () => {
  const database = "review-mistakes-" + crypto.randomUUID();
  const board = new Chess();
  board.move("f3");
  board.move("e5");
  const evidence = {
    fen: board.fen(),
    attemptedMove: "g2g4",
    before: { line: ["e2e4"], evaluationCpFromSideToMove: 0 },
    after: { line: ["d8h4"], evaluationCpFromSideToMove: 99_999 },
  };
  try {
    await expect(
      saveReviewMistake(database, "game", {
        ...evidence,
        after: { ...evidence.after, line: ["d8d1"] },
      }),
    ).rejects.toThrow();
    await Promise.all([
      saveReviewMistake(database, "game", evidence),
      saveReviewMistake(database, "game", evidence),
    ]);
    const id = reviewMistakeId("game", evidence.fen);
    const [mistake] = await listReviewMistakes(database);
    expect(mistake).toMatchObject({ id, completed: false });
    if (!mistake) throw new Error("Expected a saved review mistake");
    expect(reviewMistakePractice(mistake)?.exercise.theme).toBe(
      "one-move-threat",
    );
    await completeReviewMistake(database, id);
    await saveReviewMistake(database, "game", evidence);
    expect(await listReviewMistakes(database)).toEqual([
      expect.objectContaining({ id, completed: true }),
    ]);
  } finally {
    await deleteChessTutorDatabase(database);
  }
});
