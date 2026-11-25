import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { captureDecision } from "./capture-decision";

it("weighs Nxe5 against castling and explains why the material gain can vanish", () => {
  const position = new Chess();
  for (const move of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6"])
    position.move(move);
  const capture = position.move("Nxe5");
  const reply = position.move("Qd4");
  const decision = captureDecision(
    capture,
    reply,
    { line: ["d8d4", "e5f3", "d4e4"], evaluationCpFromSideToMove: 58 },
    14,
    "e1g1",
  );
  expect(decision?.verdict).toContain("preferred O-O");
  expect(decision?.consequence).toContain("takes on e4 with check");
  expect(decision?.question).toContain("threat against the queen on d4");
  expect(decision?.line).toBe("Nf3 Qxe4+");
  const shortLine = captureDecision(
    capture,
    reply,
    { line: ["d8d4", "e5f3"], evaluationCpFromSideToMove: 58 },
    14,
  );
  expect(shortLine?.consequence).toContain(
    "can recover a pawn on e4 with check",
  );
  expect(shortLine?.line).toBe("Nf3");
});

it("uses the CPU’s perspective even for a Black learner and allows a short line", () => {
  const position = new Chess();
  for (const move of ["e4", "e5", "d4"]) position.move(move);
  const capture = position.move("exd4"),
    reply = position.move("Qxd4");
  const decision = captureDecision(
    capture,
    reply,
    { line: [reply.lan], evaluationCpFromSideToMove: -70 },
    65,
  );
  expect(decision?.verdict).toContain("close to Stockfish");
  expect(decision?.line).toBe("");
  expect(decision?.consequence).toBe("");
});
