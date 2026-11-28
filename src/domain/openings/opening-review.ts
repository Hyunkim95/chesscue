import { Chess, type Color, type Square } from "chess.js";

import type { BoardArrow } from "../analysis/board-move-cues";
import type { StoryFrame } from "../analysis/line-storyboard";
import { err, ok, type Result } from "../../shared/result/result";
import { explainDeparture } from "./explain-departure";
import {
  trackOpening,
  type NamedOpening,
  type OpeningBook,
} from "./opening-book";
import { ideasFor, OPENING_IDEAS_VERSION } from "./opening-ideas";
import {
  OPENING_PRINCIPLES_VERSION,
  openingPrinciples,
} from "./opening-principles";

// What a finished game did in the opening, as board frames: where it left the
// book, the player's opening-principle slips, then the opening's plan, pawn
// break and trap. Every frame carries its own position and arrows.

export interface MoveEvaluation {
  // Stockfish's score after the played move, from the mover's side.
  readonly playedCp: number;
  readonly candidates: readonly {
    readonly uci: string;
    readonly evaluationCp: number;
  }[];
}

export interface OpeningReview {
  readonly version: string;
  readonly opening: NamedOpening;
  // "You left the book on move 4", "Your opponent left the book on move 4"
  // or "Every move followed the book".
  readonly summary: string;
  readonly frames: readonly StoryFrame[];
}

const arrows = (
  pairs: readonly (readonly [Square, Square])[],
  kind: BoardArrow["kind"],
): BoardArrow[] => pairs.map(([from, to]) => ({ from, to, kind }));

function afterSans(sans: readonly string[]) {
  const board = new Chess();
  let last = "";
  for (const san of sans) last = board.move(san).lan;
  return { fen: board.fen(), last };
}

function afterUcis(moves: readonly string[], plies: number) {
  const board = new Chess();
  for (const uci of moves.slice(0, plies)) board.move(uci);
  return board.fen();
}

export function openingReview(input: {
  readonly book: OpeningBook;
  // The game's moves from the standard start.
  readonly moves: readonly string[];
  readonly playerColor: Color;
  // Stockfish's checks of the player's moves, by ply.
  readonly evaluations?: ReadonlyMap<number, MoveEvaluation>;
}): Result<OpeningReview | undefined, "illegal-move"> {
  const { book, moves, playerColor } = input;
  const tracked = trackOpening(book, moves);
  if (!tracked.ok) return tracked;
  const { opening, departure, theory } = tracked.value;
  if (!opening) return ok(undefined);
  const principles = openingPrinciples({ moves, color: playerColor, theory });
  if (!principles.ok) return err(principles.error);

  const frames: StoryFrame[] = [];
  let summary = "Every move followed the book";
  if (departure) {
    const evaluation =
      departure.color === playerColor
        ? input.evaluations?.get(departure.ply)
        : undefined;
    const bookUci = departure.bookMoves[0];
    const bookCp = evaluation?.candidates.find(
      ({ uci }) => uci === bookUci,
    )?.evaluationCp;
    const explained = explainDeparture({
      departure,
      playerColor,
      ...(evaluation && bookCp !== undefined
        ? { scores: { bookCp, playedCp: evaluation.playedCp } }
        : {}),
    });
    const moveNumber = String(Math.ceil(departure.ply / 2));
    summary =
      departure.color === playerColor
        ? `You left the book on move ${moveNumber}`
        : `Your opponent left the book on move ${moveNumber}`;
    frames.push({
      fen: departure.fenBefore,
      moveUci: moves[departure.ply - 2] ?? "",
      by: "learner",
      arrows: [
        { from: departure.playedFrom, to: departure.playedTo, kind: "tried" },
        ...arrows(explained.arrows, "move"),
      ],
      outlines: [],
      control: explained.outlined.map((square) => ({
        square,
        change: "gained" as const,
      })),
      caption: explained.text,
    });
  }

  for (const fact of principles.value)
    frames.push({
      fen: afterUcis(moves, fact.ply),
      moveUci: moves[fact.ply - 1] ?? "",
      by: "learner",
      arrows: arrows(fact.arrows, "move"),
      outlines: fact.outlined.map((square) => ({
        square,
        tone: "coral" as const,
      })),
      control: [],
      caption: fact.text,
    });

  const sheet = ideasFor(opening.name);
  if (sheet) {
    const reference = afterSans(sheet.line);
    for (const idea of [sheet.plan, sheet.pawnBreak])
      if (idea)
        frames.push({
          fen: reference.fen,
          moveUci: reference.last,
          by: "learner",
          arrows: arrows(idea.arrows, "preview"),
          outlines: [],
          control: [],
          caption: idea.text,
        });
    if (sheet.trap) {
      const trap = afterSans(sheet.trap.line);
      frames.push({
        fen: trap.fen,
        moveUci: trap.last,
        by: "learner",
        arrows: [],
        outlines: [],
        control: [],
        caption: sheet.trap.text,
      });
    }
  }

  return ok({
    version: [
      book.version,
      OPENING_PRINCIPLES_VERSION,
      OPENING_IDEAS_VERSION,
    ].join("+"),
    opening,
    summary,
    frames,
  });
}
