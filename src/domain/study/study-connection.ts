import { Chess, type Move, type PieceSymbol } from "chess.js";
import type { MovePattern } from "../curriculum/playing-snapshot";
import { tutorGameMode } from "../game/types";
import { moveNotation } from "./historical-game";

const pieces: Readonly<Record<PieceSymbol, string>> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function studyOrigin(pattern: MovePattern | undefined) {
  const observed = pattern?.moves[0];
  if (!pattern || !observed) return null;
  const { game, drill, ply } = observed;
  const board = new Chess(drill.exercise.fen);
  const preferred = board.move(drill.candidate);
  board.undo();
  const played = board.move(drill.played);
  const next = game.moves[ply];
  const reply = next
    ? board
        .moves({ verbose: true })
        .find((move) => move.lan === next.uci && move.after === next.fenAfter)
    : undefined;
  return {
    position: {
      fen: played.before,
      orientation:
        played.color === "w" ? ("white" as const) : ("black" as const),
      continuation: reply ? [played.san, reply.san] : [played.san],
    },
    theme: pattern.name,
    gameLabel: drill.imported
      ? "Imported game"
      : tutorGameMode(game) === "rated"
        ? "Rated game"
        : "Coached game",
    day: drill.completedAt.slice(0, 10),
    played: moveNotation(played),
    preferred: moveNotation(preferred),
    candidateAction: moveAction(preferred),
    reply: reply ? moveNotation(reply) : null,
  };
}

export type StudyOrigin = NonNullable<ReturnType<typeof studyOrigin>>;

// Both sides of the comparison use moves replayed by the rules engine.
function moveAction(move: Move) {
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return "activate the rook by castling";
  if (move.san.endsWith("#")) return "deliver checkmate";
  if (move.san.endsWith("+")) return "give check";
  if (move.captured) return "capture the " + pieces[move.captured];
  const home = move.color === "w" ? "1" : "8";
  if (
    (move.piece === "n" && ["b" + home, "g" + home].includes(move.from)) ||
    (move.piece === "b" && ["c" + home, "f" + home].includes(move.from))
  )
    return "develop a minor piece";
  return "reposition the " + pieces[move.piece];
}

export function explainStudyLine(
  fen: string,
  continuation: readonly string[],
  origin?: Pick<StudyOrigin, "candidateAction" | "preferred"> | null,
) {
  const board = new Chess(fen);
  const moves = continuation.map((san) => board.move(san));
  const first = moves[0];
  if (!first) return "";
  const notation = moveNotation(first);
  const action = moveAction(first);
  const side = first.color === "w" ? "White" : "Black";
  let detail: string;
  if (first.isKingsideCastle() || first.isQueensideCastle()) {
    const rank = first.from.charAt(1);
    const start = (first.isKingsideCastle() ? "h" : "a") + rank;
    const end = (first.isKingsideCastle() ? "f" : "d") + rank;
    detail = `${notation} moved the king from ${first.from} to ${first.to} and brought the rook from ${start} to ${end}.`;
    const next = moves
      .slice(1)
      .find((move) => move.from === end || move.to === end);
    if (
      next?.piece === "r" &&
      next.color === first.color &&
      next.from === end
    ) {
      const file = next.to.charAt(0);
      const open = !new Chess(next.before)
        .board()
        .flat()
        .some((piece) => piece?.type === "p" && piece.square.startsWith(file));
      const after =
        moves[1] && next === moves[2]
          ? "After " + moveNotation(moves[1]) + ", "
          : "";
      detail += ` ${after}${moveNotation(next)} brought that rook to ${next.to}${open ? " on the open " + file + "-file" : ""}.`;
    }
  } else {
    const verb = first.captured
      ? `captured the ${pieces[first.captured]} on ${first.to} with the ${pieces[first.piece]}`
      : `moved the ${pieces[first.piece]} from ${first.from} to ${first.to}`;
    detail = `With ${notation}, ${side} ${verb}${first.san.endsWith("#") ? " for checkmate" : first.san.endsWith("+") ? " with check" : ""}.`;
    if (moves[1])
      detail += ` The recorded reply was ${moveNotation(moves[1])}.`;
  }
  if (!origin) return detail;
  if (action === origin.candidateAction)
    return (
      detail +
      (action === "activate the rook by castling"
        ? " Castling offered the same way to activate your rook."
        : ` You had the same opportunity to ${action} with ${origin.preferred}.`)
    );
  return `${detail} Compare that choice with ${origin.preferred}, your opportunity to ${origin.candidateAction}.`;
}
