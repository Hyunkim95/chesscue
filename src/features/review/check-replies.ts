import { Chess, type Move } from "chess.js";
import { materialBalance } from "../../domain/game/board-balance";
import { pieceNames } from "../board/board-pieces";

function explainEvasion(move: Move, position: Chess): string {
  const rights = position.getCastlingRights(move.color);
  if (move.captured) {
    const target = pieceNames[move.captured];
    return move.piece === "k"
      ? `Your king takes the ${target} and escapes the check.`
      : `Taking the ${target} with your ${pieceNames[move.piece]} gets your king out of check.`;
  }
  if (move.piece === "k") {
    const queensStay =
      position.findPiece({ color: "w", type: "q" }).length > 0 &&
      position.findPiece({ color: "b", type: "q" }).length > 0;
    if (rights.k || rights.q)
      return queensStay
        ? "Both queens stay on the board, and moving your king gives up castling."
        : "Your king escapes, but moving it gives up castling.";
    return `Your king escapes to ${move.to} without trading material.`;
  }
  const after = new Chess(move.after);
  const take = after
    .moves({ verbose: true })
    .find(
      (candidate) =>
        candidate.to === move.to && candidate.captured === move.piece,
    );
  if (take) {
    after.move(take.lan);
    const retake = after
      .moves({ verbose: true })
      .find(
        (candidate) =>
          candidate.captured === take.piece && candidate.to === take.to,
      );
    if (retake && move.piece === "q" && take.piece === "q") {
      after.move(retake.lan);
      if (
        retake.piece === "k" &&
        (rights.k || rights.q) &&
        after.findPiece({ color: take.color, type: "q" }).length === 0
      )
        return `Offer a queen trade. After ${take.san} ${retake.san}, you lose castling rights, but their queen can no longer attack your king.`;
      return `Block and offer a queen trade. If ${take.san}, you can take their queen with ${retake.san}.`;
    }
    if (retake) {
      const perspective = move.color === "w" ? 1 : -1;
      const change =
        perspective *
        (materialBalance(retake.after) - materialBalance(move.after));
      if (change < 0)
        return `If ${take.san} ${retake.san}, you give up a ${pieceNames[move.piece]} for a ${pieceNames[take.piece]} and lose material even after taking back.`;
      return `Block the check. If ${take.san}, you can recapture with ${retake.san}.`;
    }
    return `Block the check, but after ${take.san} you have no immediate recapture on ${take.to}.`;
  }
  return `Your ${pieceNames[move.piece]} blocks the check on ${move.to}, leaving the king in place.`;
}

export function compareCheckReplies(position: Chess, preferredUci?: string) {
  if (!position.isCheck() || position.isGameOver()) return null;
  const legal = position.moves({ verbose: true });
  const preferred = legal.find((move) => move.lan === preferredUci);
  const options = legal.map((move) => ({
    san: move.san,
    explanation: explainEvasion(move, position),
  }));
  return { options, preferred: preferred?.san };
}
