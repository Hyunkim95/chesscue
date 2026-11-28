import { Chess, type Color } from "chess.js";
import { describe, expect, it } from "vitest";

import { material } from "../analysis/board-relations";
import raw from "./openings.generated.json";
import { parseOpeningBook, trackOpening } from "./opening-book";
import { OPENING_IDEAS, ideasFor } from "./opening-ideas";

const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book = parsed.value;
const bookNames = book.openings.map(({ name }) => name);

function play(sans: readonly string[]) {
  const board = new Chess();
  const moves = sans.map((san) => board.move(san).lan);
  return { board, moves };
}

const other = (color: Color): Color => (color === "w" ? "b" : "w");

describe.each(OPENING_IDEAS.map((sheet) => [sheet.names[0], sheet] as const))(
  "%s",
  (_, sheet) => {
    it("covers names that exist in the book", () => {
      for (const prefix of sheet.names)
        expect(
          bookNames.some(
            (name) =>
              name === prefix ||
              name.startsWith(prefix + ":") ||
              name.startsWith(prefix + ","),
          ),
        ).toBe(true);
    });

    it("reaches a book position that this sheet covers", () => {
      const track = trackOpening(book, play(sheet.line).moves);
      if (!track.ok) throw new Error(track.error);
      expect(track.value.departure).toBeUndefined();
      const name = track.value.opening?.name ?? "";
      expect(ideasFor(name)).toBe(sheet);
    });

    it("draws arrows from the side's own pieces", () => {
      const { board } = play(sheet.line);
      const ideas = [sheet.plan, sheet.pawnBreak].flatMap((idea) =>
        idea ? [idea] : [],
      );
      for (const { arrows } of ideas)
        for (const [from, to] of arrows) {
          expect(board.get(from)?.color, from).toBe(sheet.side);
          expect(to).not.toBe(from);
        }
    });

    it("breaks with a pawn moving forward", () => {
      const { board } = play(sheet.line);
      const forward = sheet.side === "w" ? 1 : -1;
      for (const [from, to] of sheet.pawnBreak?.arrows ?? []) {
        expect(board.get(from)?.type, from).toBe("p");
        const ranks = (Number(to[1]) - Number(from[1])) * forward;
        expect(ranks).toBeGreaterThanOrEqual(1);
        expect(ranks).toBeLessThanOrEqual(2);
        expect(Math.abs(to.charCodeAt(0) - from.charCodeAt(0))).toBe(0);
      }
    });

    it.runIf(sheet.trap)("has a sound trap", () => {
      const trap = sheet.trap;
      if (!trap) return;
      expect(trap.line.slice(0, sheet.line.length)).toEqual(sheet.line);
      const { board } = play(trap.line);
      if (trap.outcome === "mate") {
        expect(board.isCheckmate()).toBe(true);
        expect(board.turn()).toBe(other(trap.winner));
      } else {
        expect(
          material(board, trap.winner) - material(board, other(trap.winner)),
        ).toBeGreaterThanOrEqual(2);
      }
    });
  },
);

describe("ideasFor", () => {
  it("picks the most specific sheet", () => {
    expect(
      ideasFor("Petrov's Defense: Stafford Gambit Accepted")?.names,
    ).toContain("Petrov's Defense: Stafford Gambit");
    expect(ideasFor("Petrov's Defense: Classical Attack")?.names).toEqual([
      "Petrov's Defense",
    ]);
  });

  it("does not match a name that only starts with the same letters", () => {
    expect(ideasFor("Italian Gameplan")).toBeUndefined();
  });

  it("gives each name prefix to one sheet", () => {
    const prefixes = OPENING_IDEAS.flatMap(({ names }) => names);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
