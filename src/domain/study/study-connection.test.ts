import { expect, it } from "vitest";
import { explainStudyLine } from "./study-connection";

it("traces the rook activated by castling to its recorded open file", () => {
  const explanation = explainStudyLine(
    "r3kb1r/1p3ppp/p3qn2/8/8/2N1N3/PP2QPPP/R3K2R w KQkq - 0 17",
    ["O-O", "Bc5", "Rfe1", "O-O"],
    {
      candidateAction: "activate the rook by castling",
      preferred: "5. O-O",
    },
  );
  expect(explanation).toContain("h1 to f1");
  expect(explanation).toContain("18. Rfe1");
  expect(explanation).toContain("open e-file");
});
