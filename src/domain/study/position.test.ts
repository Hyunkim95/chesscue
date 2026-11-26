import { cutoffFen, cutoffLayout } from "../../test/fixtures/study-position";
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  boardFacts,
  buildRequestedSetup,
  editPosition,
  isStudyPosition,
  validStudyAnswer,
} from "./position";
import {
  courses,
  libraryRoadmap,
  roadmapSchema,
  verifyGameScore,
} from "./roadmap";
describe("study positions", () => {
  it("rejects a source score which does not contain the generated decisions", () => {
    expect(verifyGameScore("attack", "1. e4 e5 *")).toBeNull();
  });
  it("replays every sourced continuation and roundtrips each versioned bundle", () => {
    for (const topic of ["rook", "attack"] as const) {
      expect(roadmapSchema.parse(libraryRoadmap(topic))).toEqual(
        libraryRoadmap(topic),
      );
      for (const l of courses[topic].lessons) {
        expect(isStudyPosition(l.fen)).toBe(true);
        const board = new Chess(l.fen);
        for (const san of l.continuation) expect(board.move(san).san).toBe(san);
      }
    }
  });
  it("keeps explicit square requests even when Nano proposes a different layout", () => {
    const fen = buildRequestedSetup(
      cutoffLayout,
      "Set up a rook ending with the white king on b2 and the black king on g7",
    );
    expect(fen).toBe(editPosition(cutoffFen, "a2", "b2"));
  });
  it("enforces requested material counts from Nano's proposed squares", () => {
    const layout =
      "white king on e1, black king on e8, white rook on a1, white rook on h1, black rook on a8, black rook on h8, white pawn on d2, black pawn on d7";
    const fen = buildRequestedSetup(
      layout,
      "Create a rook ending with both kings, two rooks and a pawn",
    );
    if (!fen) throw Error("Expected a validated setup");
    const pieces = new Chess(fen)
      .board()
      .flat()
      .filter((p) => p !== null);
    expect(
      pieces
        .filter((p) => p.type === "r")
        .map((p) => p.color)
        .sort(),
    ).toEqual(["b", "w"]);
    expect(pieces.filter((p) => p.type === "p")).toHaveLength(1);
    expect(
      buildRequestedSetup(layout, "Create a rook ending with five white rooks"),
    ).toBeNull();
  });
  it("rejects missing kings, adjacent kings, invalid edits and impossible check states", () => {
    expect(editPosition(cutoffFen, "a2", "g8")).toBeNull();
    expect(editPosition(cutoffFen, "a2", "h2")).toBeNull();
    expect(
      buildRequestedSetup(
        "white king on a1, white rook on g1, black king on g8",
        "",
      ),
    ).toBeNull();
    expect(buildRequestedSetup("white king on a1", "")).toBeNull();
    expect(
      buildRequestedSetup(
        "white king on a1, black king on h8, white queen on d4",
        "rook ending",
      ),
    ).toBeNull();
  });
  it("uses legal engine lines and reports the pieces controlling requested squares", () => {
    const facts = boardFacts(cutoffFen, ["a2b2", "a1h8"], "Who covers d2?");
    expect(facts.engineLine).toEqual(["Kb2"]);
    expect(facts.squareControl).toContain(
      "Black covers d2 with the rook on d6.",
    );
    expect(validStudyAnswer("Consider the rook on d6.", facts)).toBe(true);
    expect(validStudyAnswer("Play Qxh8 for mate in two.", facts)).toBe(false);
  });
});
