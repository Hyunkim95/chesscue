import { Chess } from "chess.js";

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
