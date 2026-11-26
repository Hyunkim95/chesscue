import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { rookCaptureAnswer } from "./rook-capture-answer";

test("answers a legal capture question without exposing a hidden reply", () => {
  const position = new Chess("4k3/8/8/8/5n2/8/4N3/4K3 b - - 0 1");
  const checked = new Chess(position.fen()).move("Nxe2");
  expect(rookCaptureAnswer("black takes knight?", position, checked)).toBe(
    "Yes. Stockfish found a knight capture for Black. Try it on the board.",
  );
  expect(rookCaptureAnswer("Can Black take the knight on e2?", position)).toBe(
    "Yes. Black can take the knight on e2 with Nxe2.",
  );
  expect(rookCaptureAnswer("Can Black capture a knight on a2?", position)).toBe(
    "Black can’t legally capture a White knight from this position.",
  );
});
