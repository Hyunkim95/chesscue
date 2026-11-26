import { Chess, type Move } from "chess.js";
import { pieceNames } from "../board/board-pieces";

export function describeReviewMove(position: Chess, move: Move): string {
  const piece = pieceNames[move.promotion ?? move.piece];
  if (position.isCheckmate())
    return "The king is in check and has no legal escape.";
  if (move.isPromotion() && move.promotion !== undefined)
    return `The pawn becomes a ${pieceNames[move.promotion]} on ${move.to}.`;
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `The king castles to ${move.to} and the rook moves beside it.`;
  const check = position.isCheck() ? " and gives check" : "";
  if (move.isEnPassant())
    return `The pawn captures en passant and lands on ${move.to}${check}.`;
  if (move.captured !== undefined)
    return `The ${piece} takes the ${pieceNames[move.captured]} on ${move.to}${check}.`;
  const attacked = position
    .board()
    .flat()
    .find(
      (target) =>
        target !== null &&
        target.color !== move.color &&
        target.type !== "p" &&
        target.type !== "k" &&
        position.attackers(target.square, move.color).includes(move.to),
    );
  if (attacked != null)
    return `The ${piece} ${position.isCheck() ? "gives check and " : ""}attacks the ${pieceNames[attacked.type]} on ${attacked.square}.`;
  if (position.isCheck())
    return `The ${piece} gives check from ${move.to}. The king must get out of check.`;
  const opponent = position.turn();
  if (
    new Chess(move.before).isAttacked(move.from, opponent) &&
    !position.isAttacked(move.to, opponent)
  )
    return `The ${piece} was under attack on ${move.from}. On ${move.to} it’s out of reach for now.`;
  const homeRank = move.color === "w" ? "1" : "8";
  if (
    (move.piece === "b" || move.piece === "n") &&
    move.from.endsWith(homeRank) &&
    !move.to.endsWith(homeRank)
  )
    return `The ${piece} leaves the back rank and joins the play on ${move.to}.`;
  return `The ${piece} moves from ${move.from} to ${move.to}${check}.`;
}
