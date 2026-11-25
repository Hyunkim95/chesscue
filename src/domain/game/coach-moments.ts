import { Chess, type Move, type PieceSymbol } from "chess.js";
import { tutorGameMode, type GameRecord } from "./types";

interface MateOpportunity {
  readonly ply: number;
  readonly san: string;
  readonly found: boolean;
}

const uci = (move: Move): string =>
  `${move.from}${move.to}${move.promotion ?? ""}`;

function mateOpportunity(
  chess: Chess,
  played: string,
  ply: number,
): MateOpportunity | null {
  const mates = chess
    .moves({ verbose: true })
    .filter((move) => move.san.endsWith("#"));
  const actual = mates.find((move) => uci(move) === played);
  const mate = actual ?? mates[0];
  return mate === undefined
    ? null
    : { ply, san: mate.san, found: actual !== undefined };
}

export function mateOpportunities(
  game: GameRecord,
): readonly MateOpportunity[] {
  const learner = game.playerColor === "white" ? "w" : "b";
  if (game.playerColor === null) return [];
  return game.moves.flatMap((move, index) => {
    try {
      const before = new Chess(
        game.moves[index - 1]?.fenAfter ?? game.initialFen,
      );
      if (before.turn() !== learner) return [];
      const opportunity = mateOpportunity(before, move.uci, move.ply);
      return opportunity === null ? [] : [opportunity];
    } catch {
      return [];
    }
  });
}

export interface CoachMoment {
  readonly ply: number;
  readonly replayPly: number;
  readonly title: string;
  readonly detail: string;
}

const pieceNames: Readonly<Record<Exclude<PieceSymbol, "p" | "k">, string>> = {
  b: "bishop",
  n: "knight",
  q: "queen",
  r: "rook",
};

function pieceLostAfterMove(
  game: GameRecord,
  index: number,
  reply: Move,
  positionAfterReply: Chess,
): CoachMoment | null {
  const previous = game.moves[index - 1];
  const current = game.moves[index];
  const captured = reply.captured;
  if (
    previous === undefined ||
    current === undefined ||
    previous.ply <= (game.coachJoinedAtPly ?? 0) ||
    previous.uci.slice(2, 4) !== reply.to ||
    previous.san.includes("x") ||
    captured === undefined ||
    captured === "p" ||
    captured === "k"
  )
    return null;

  const canTakeBack = positionAfterReply
    .moves({ verbose: true })
    .some((move) => move.to === reply.to && move.isCapture());
  if (canTakeBack) return null;

  const piece = pieceNames[captured];
  return {
    ply: current.ply,
    replayPly: previous.ply - 1,
    title: `Your ${piece} was taken on ${reply.to}`,
    detail: `After ${previous.san}, your opponent played ${reply.san} to take your ${piece}. You couldn’t take back on ${reply.to}.`,
  };
}

function centerBeforeCastling(
  game: GameRecord,
  index: number,
  reply: Move,
): CoachMoment | null {
  const previous = game.moves[index - 1];
  const current = game.moves[index];
  if (
    previous === undefined ||
    current === undefined ||
    previous.ply <= (game.coachJoinedAtPly ?? 0) ||
    reply.captured !== "p"
  )
    return null;
  const before = new Chess(game.moves[index - 2]?.fenAfter ?? game.initialFen);
  const legal = before.moves({ verbose: true });
  const played = legal.find((move) => uci(move) === previous.uci);
  const castle = legal.find((move) => move.isKingsideCastle());
  if (
    played?.piece !== "p" ||
    played.isCapture() ||
    !["d4", "e4", "d5", "e5"].includes(played.to) ||
    played.to !== reply.to ||
    castle === undefined
  )
    return null;
  return {
    ply: current.ply,
    replayPly: previous.ply - 1,
    title: "The center changed before you castled",
    detail: `After ${played.san}, your opponent played ${reply.san} while your king was still on ${castle.from}. Castling was legal in the original position.`,
  };
}

function coachMomentAt(game: GameRecord, index: number): CoachMoment | null {
  const last = game.moves[index];
  if (last === undefined) return null;
  const before = new Chess(game.moves[index - 1]?.fenAfter ?? game.initialFen);
  const learner = game.playerColor === "white" ? "w" : "b";
  if (before.turn() === learner) {
    const opportunity = mateOpportunity(before, last.uci, last.ply);
    return opportunity === null || opportunity.found
      ? null
      : {
          ply: last.ply,
          replayPly: last.ply - 1,
          title: "A mate was available",
          detail: `You could play ${opportunity.san} to end the game. Replay the position afterward to see why it works.`,
        };
  }
  const move = before.move(last.san);
  const pieceLost = pieceLostAfterMove(game, index, move, before);
  if (pieceLost !== null) return pieceLost;
  const center = centerBeforeCastling(game, index, move);
  if (center !== null) return center;
  if (move.piece !== "n" || !before.isCheck() || before.isCheckmate())
    return null;
  if (
    before
      .moves({ verbose: true })
      .some((reply) => reply.captured === "n" && reply.to === move.to)
  )
    return null;
  const target = before
    .board()
    .flat()
    .find(
      (piece) =>
        piece !== null &&
        piece.color === learner &&
        (piece.type === "r" || piece.type === "q") &&
        before.attackers(piece.square, move.color).includes(move.to),
    );
  if (target === undefined || target === null) return null;
  return {
    ply: last.ply,
    replayPly: last.ply,
    title: `The knight’s fork on ${move.to}`,
    detail: `The knight checks your king and attacks your ${target.type === "q" ? "queen" : "rook"} on ${target.square}.`,
  };
}

export function savedCoachMoments(
  game: GameRecord,
  fromPly = 0,
): readonly CoachMoment[] {
  if (tutorGameMode(game) !== "coached") return [];
  const start = Math.max(fromPly, game.coachJoinedAtPly ?? 0);
  return game.moves.slice(start).flatMap((_, index) => {
    try {
      const moment = coachMomentAt(game, start + index);
      return moment === null ? [] : [moment];
    } catch {
      return [];
    }
  });
}

/** A rook or queen delivers mate along the enemy king's home rank. */
export function isBackRankFinish(fen: string, san: string): boolean {
  try {
    const position = new Chess(fen),
      move = position.move(san);
    const piece = move.promotion ?? move.piece;
    if ((piece !== "r" && piece !== "q") || !move.san.endsWith("#"))
      return false;
    const home = position.turn() === "w" ? "1" : "8";
    const king = position.findPiece({ color: position.turn(), type: "k" })[0];
    return (
      king !== undefined &&
      king.endsWith(home) &&
      move.to.endsWith(home) &&
      position.attackers(king, move.color).includes(move.to)
    );
  } catch {
    return false;
  }
}
