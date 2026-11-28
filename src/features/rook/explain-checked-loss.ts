import { Chess, type Move, type PieceSymbol } from "chess.js";

import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import { isMateScore } from "../../domain/analysis/classify-experiment";
import { materialBalance } from "../../domain/game/board-balance";
import { pieceNames } from "../board/board-pieces";

const pieceOrder: readonly PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

function replay(fen: string, result: ReviewReply) {
  const board = new Chess(fen);
  return (result.evidenceLine ?? result.line).map((uci) => board.move(uci));
}

function pieceList(pieces: readonly PieceSymbol[]): string {
  const names = pieces.map((piece) => pieceNames[piece]);
  const [first, second] = names;
  if (first && names.length === 2 && first === second) return `two ${first}s`;
  return new Intl.ListFormat("en").format(names);
}

function lostDefense(
  attempt: Move,
  alternative: Move | undefined,
  reply: Move,
) {
  if (!alternative) return null;
  const board = new Chess(alternative.after);
  const sameReply = board
    .moves({ verbose: true })
    .find(({ lan }) => lan === reply.lan);
  if (!sameReply) return null;
  board.move(sameReply.lan);
  if (!board.isCheck()) return null;
  const couldDefend = board
    .moves({ verbose: true })
    .some(({ from }) => from === attempt.from);
  return couldDefend
    ? `Your ${pieceNames[attempt.piece]} could answer the check from ${attempt.from}.`
    : null;
}

// Sentences that name no concrete board fact. Rook adds the reply's own
// explanation after these.
const GENERIC_LOSS =
  /^(?:The checked line leaves you with less material|Stockfish preferred|The checked continuation gives)/;

export function isGenericLoss(text: string): boolean {
  return GENERIC_LOSS.test(text);
}

export function explainCheckedLoss(
  attempt: Move,
  checkedReply: ReviewReply,
  checkedAlternative: ReviewReply,
): string {
  const opponent = attempt.color === "w" ? "Black" : "White";
  const attemptLine = replay(attempt.after, checkedReply);
  const alternativeLine = replay(attempt.before, checkedAlternative);
  const reply = attemptLine[0];
  if (reply) {
    const afterReply = new Chess(reply.after);
    if (afterReply.isCheckmate())
      return (
        lostDefense(attempt, alternativeLine[0], reply) ??
        "Your king has no escape from the next check."
      );

    const firstOtherMove = attemptLine.findIndex(
      (move) => !move.captured || move.to !== reply.to,
    );
    const exchange = attemptLine.slice(
      0,
      firstOtherMove < 0 ? undefined : firstOtherMove,
    );
    const lost = exchange.flatMap(({ color, captured }) =>
      color !== attempt.color && captured ? [captured] : [],
    );
    if (lost.length > 1)
      return `The exchange on ${reply.to} costs you your ${pieceList(lost)}.`;

    const promotion = attemptLine.find(
      (move) => move.color !== attempt.color && move.isPromotion(),
    );
    if (
      promotion &&
      !alternativeLine.some(
        (move) =>
          move.color === promotion.color &&
          move.isPromotion() &&
          move.to.startsWith(promotion.to.slice(0, 1)),
      )
    ) {
      let origin = promotion.from;
      for (const move of attemptLine
        .slice(0, attemptLine.indexOf(promotion))
        .reverse()) {
        if (
          move.color === promotion.color &&
          move.piece === "p" &&
          move.to === origin
        )
          origin = move.from;
      }
      const file = origin.slice(0, 1);
      return `${opponent}’s ${file}-pawn can reach promotion in the checked line.`;
    }

    if (reply.captured) {
      const square = reply.isEnPassant()
        ? reply.to.slice(0, 1) + reply.from.slice(1)
        : reply.to;
      return `${opponent} can take the ${pieceNames[reply.captured]} on ${square}.`;
    }

    const beforeReply = new Chess(reply.before);
    const targets = afterReply
      .board()
      .flat()
      .filter((piece) => piece !== null)
      .filter(
        (piece) =>
          piece.color === attempt.color &&
          afterReply.attackers(piece.square, reply.color).includes(reply.to),
      )
      .toSorted(
        (left, right) =>
          pieceOrder.indexOf(left.type) - pieceOrder.indexOf(right.type),
      );
    const attackerCanBeTaken = afterReply
      .moves({ verbose: true })
      .some((move) => move.to === reply.to && move.isCapture());
    if (
      !attackerCanBeTaken &&
      targets.some(
        ({ square }) =>
          !beforeReply.attackers(square, reply.color).includes(reply.from),
      )
    ) {
      const [first, second] = targets;
      if (first && second) {
        const pieces = pieceList([first.type, second.type]);
        return `${opponent} can attack ${first.type === second.type ? pieces : `your ${pieces}`} with one move.`;
      }
      if (first && first.type !== "k")
        return `${opponent} can put your ${pieceNames[first.type]} on ${first.square} under attack.`;
    }
    // A fork can still work when the forking piece can be taken, because the
    // capture costs something else. Name it when the checked line loses
    // material.
    const forked = targets.filter(
      ({ type, square }) =>
        type !== "k" &&
        type !== "p" &&
        !beforeReply.attackers(square, reply.color).includes(reply.from),
    );
    const [first, second] = forked;
    const sign = attempt.color === "w" ? 1 : -1;
    const lineEnd = attemptLine.at(-1)?.after ?? reply.after;
    const lineLoss =
      (materialBalance(attempt.before) - materialBalance(lineEnd)) * sign;
    if (first && second && lineLoss > 0)
      return `${opponent}’s ${reply.san} attacks your ${pieceNames[first.type]} on ${first.square} and ${pieceNames[second.type]} on ${second.square} at once, and the checked line leaves you with less material.`;
    if (afterReply.isCheck()) return "Your king can be put in check.";
  }

  const plies = Math.min(alternativeLine.length, attemptLine.length + 1);
  if (plies > 1) {
    const played = attemptLine[plies - 2];
    const alternative = alternativeLine[plies - 1];
    if (played && alternative) {
      const loss =
        (materialBalance(alternative.after) - materialBalance(played.after)) *
        (attempt.color === "w" ? 1 : -1);
      if (loss > 0)
        return "The checked line leaves you with less material than the alternative.";
    }
  }

  if (
    checkedReply.evaluationCpFromSideToMove > 0 &&
    isMateScore(checkedReply.evaluationCpFromSideToMove)
  )
    return `${opponent} has a forced mate.`;
  if (
    checkedAlternative.evaluationCpFromSideToMove > 0 &&
    isMateScore(checkedAlternative.evaluationCpFromSideToMove)
  )
    return "That gives up your forced mate.";
  const strongerMove = alternativeLine[0];
  return strongerMove && strongerMove.lan !== attempt.lan
    ? `Stockfish preferred ${strongerMove.san} from the same position.`
    : "The checked continuation gives your opponent a better position.";
}
