import { expect, test } from "vitest";

import { forcingScan, scanHint } from "./forcing-moves";

// Lichess puzzle 0Uxzm: Nxg5+ forks the king and queen.
const FORK = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";

test("lists every check and capture, including the winning fork", () => {
  const scan = forcingScan(FORK);
  expect(scan?.checks.map(({ san }) => san)).toEqual(
    expect.arrayContaining(["Nxg5+", "Ne5+"]),
  );
  // exf4 is missing on purpose: the e3 pawn is pinned to the king by the
  // queen on e6.
  expect(scan?.captures.map(({ san }) => san).sort()).toEqual([
    "Nxg5+",
    "Rxb3",
    "gxf4",
  ]);
});

test("counts a quiet move as a threat only when it newly attacks a loose or bigger piece", () => {
  // Rc7 attacks the undefended rook on b7; Ra1 attacks nothing new.
  const scan = forcingScan("6k1/1r6/8/8/8/8/8/2R3K1 w - - 0 1");
  const threats = scan?.threats.map(({ move, target }) => [move.san, target]);
  expect(threats).toContainEqual(["Rc7", "b7"]);
  expect(threats?.some(([san]) => san === "Ra1")).toBe(false);
});

test("caps each row and says none when a row is empty", () => {
  // The knight on d4 can take eight pawns.
  const hint = scanHint("7k/8/2p1p3/1p3p2/3N4/1p3p2/2p1p3/K7 w - - 0 1");
  const captures = hint?.rows.find(({ label }) => label === "Captures");
  expect(captures?.moves).toMatch(/^(?:Nx\w+, ){3}Nx\w+ and 4 more$/);
  const quiet = scanHint(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  );
  expect(quiet?.rows.map(({ moves }) => moves)).toEqual([
    "none",
    "none",
    "none",
  ]);
  expect(quiet?.arrows).toEqual([]);
});

test("draws one arrow per listed move, coloured by its first kind", () => {
  // Qxe8+ both captures and checks; Qxa7 only captures; Nd6 threatens f7.
  const hint = scanHint("4r1k1/p4p2/8/1N6/8/8/8/K3Q3 w - - 0 1");
  expect(hint?.rows.map(({ kind }) => kind)).toEqual([
    "check",
    "capture",
    "threat",
  ]);
  const kinds = new Map(
    hint?.arrows.map(({ from, to, kind }) => [from + to, kind]),
  );
  expect(kinds.get("e1e8")).toBe("scan-check");
  expect(kinds.get("b5a7")).toBe("scan-capture");
  expect(
    hint?.arrows.filter(({ from, to }) => from + to === "e1e8"),
  ).toHaveLength(1);
});

test("rejects an invalid position", () => {
  expect(forcingScan("not a fen")).toBeUndefined();
});
