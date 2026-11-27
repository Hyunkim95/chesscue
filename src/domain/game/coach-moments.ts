import { Chess, type Move, type PieceSymbol } from "chess.js";
import {
  classifyExperiment,
  isMateScore,
  moveLossCp,
  type ExperimentEvaluation,
} from "../analysis/classify-experiment";
import { legalBoardLine } from "../analysis/board-move-cues";
import { materialBalance } from "./board-balance";
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

export function coachObservationCheck(game: GameRecord) {
  if (tutorGameMode(game) !== "coached" || game.result !== null) return null;
  const played = game.moves.at(-2);
  const reply = game.moves.at(-1);
  if (!played || !reply || played.ply <= (game.coachJoinedAtPly ?? 0))
    return null;

  const beforeFen = game.moves.at(-3)?.fenAfter ?? game.initialFen;
  const [actualMove, actualReply] = legalBoardLine(beforeFen, [
    played.uci,
    reply.uci,
  ]);
  const learner = game.playerColor === "white" ? "w" : "b";
  if (
    game.playerColor === null ||
    actualMove?.color !== learner ||
    !actualReply ||
    actualMove.after !== played.fenAfter ||
    actualReply.after !== reply.fenAfter
  )
    return null;

  return {
    beforeFen,
    afterFen: actualMove.after,
    verify(after: ExperimentEvaluation, before: ExperimentEvaluation | null) {
      if (!before || classifyExperiment(played.uci, before, after) !== "spot")
        return null;
      const stronger = legalBoardLine(beforeFen, before.line);
      const response = legalBoardLine(actualMove.after, after.line);
      const preferred = stronger[0];
      const checkedReply = response[0];
      if (
        !preferred ||
        !checkedReply ||
        preferred.lan === actualMove.lan ||
        stronger.length !== before.line.length ||
        response.length !== after.line.length
      )
        return null;

      const responseEvidence = `After your ${actualMove.san}: ${describeCoachLine(response)}.`;
      const responseMate = checkedMate(response, after);
      const preferredMate = checkedMate(stronger, before);
      let title = "Stockfish found a stronger move";
      let detail: string;
      if (responseMate !== null) {
        title = `Your opponent had mate in ${String(responseMate)}`;
        detail = `After ${actualMove.san}, Stockfish found a mating line starting with ${checkedReply.san}.`;
      } else if (preferredMate !== null) {
        title = `You had mate in ${String(preferredMate)}`;
        detail = `Before ${actualMove.san}, Stockfish found a mating line starting with ${preferred.san}.`;
      } else {
        const loss = moveLossCp(
          before.evaluationCpFromSideToMove,
          after.evaluationCpFromSideToMove,
        );
        const estimate =
          isMateScore(before.evaluationCpFromSideToMove) ||
          isMateScore(after.evaluationCpFromSideToMove)
            ? ""
            : ` by about ${(loss / 100).toFixed(1)} pawns`;
        detail = `Stockfish preferred ${preferred.san} to ${actualMove.san}${estimate}. ${responseEvidence}`;
      }
      return {
        ply: reply.ply,
        replayPly: played.ply - 1,
        title,
        detail,
      };
    },
  };
}

function describeCoachLine(line: readonly Move[]): string {
  const opening = line.slice(0, 3);
  const description = opening.map(({ san, to, captured, promotion }) =>
    captured && captured !== "k"
      ? `${san} takes the ${captured === "p" ? "pawn" : pieceNames[captured]} on ${to}`
      : promotion && promotion !== "p" && promotion !== "k"
        ? `${san} promotes to a ${pieceNames[promotion]}`
        : san,
  );
  const last = line.at(-1);
  if (last && last.san.endsWith("#") && !opening.includes(last))
    description.push(`${last.san} ends in checkmate`);
  if (opening.some((move) => move.isCapture()) && !last?.san.endsWith("#")) {
    const start = opening[0];
    const end = opening.at(-1);
    if (start && end) {
      const change = materialBalance(end.after) - materialBalance(start.before);
      if (change !== 0) {
        const side = change > 0 ? "White" : "Black";
        return `${description.join(", then ")}. ${side} gains ${String(Math.abs(change))} points of material in that sequence`;
      }
    }
  }
  return description.join(", then ");
}

function checkedMate(line: readonly Move[], evaluation: ExperimentEvaluation) {
  return evaluation.evaluationCpFromSideToMove > 0 &&
    isMateScore(evaluation.evaluationCpFromSideToMove) &&
    line.length % 2 === 1 &&
    line.at(-1)?.san.endsWith("#")
    ? Math.ceil(line.length / 2)
    : null;
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
          detail: `You could play ${opportunity.san} to end the game.`,
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
