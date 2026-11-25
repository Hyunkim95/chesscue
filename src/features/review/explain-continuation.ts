import { Chess, SQUARES, type Move, type Square } from "chess.js";
import { materialBalance } from "../../domain/game/board-balance";
import { pieceNames } from "../board/board-pieces";

const center: readonly Square[] = ["e4", "d4", "e5", "d5"];
const priority = { k: 0, q: 5, r: 4, b: 3, n: 3, p: 1 };

function materialSummary(position: Chess): string {
  const balance = materialBalance(position.fen());
  if (balance === 0) return "Material is level.";
  const side = balance > 0 ? "White" : "Black";
  const amount = Math.abs(balance);
  return amount === 1
    ? `${side} is a pawn ahead.`
    : `${side} is ahead by ${String(amount)} points of material.`;
}

function explainCapture(
  move: Move,
  captured: NonNullable<Move["captured"]>,
  before: Chess,
  after: Chess,
  previous?: Move,
): string {
  const side = move.color === "w" ? "White" : "Black";
  const opponent = move.color === "w" ? "Black" : "White";
  const canRecapture = after
    .moves({ verbose: true })
    .some((reply) => reply.to === move.to && reply.captured !== undefined);
  if (previous && !canRecapture && !move.isEnPassant()) {
    const earlier = new Chess(previous.before);
    if (move.to === previous.to)
      return `Your ${pieceNames[captured]} landed on a square where ${side} could take it. You have no immediate recapture on ${move.to}.`;
    if (
      earlier.attackers(move.to, previous.color).includes(previous.from) &&
      !before.isAttacked(move.to, previous.color)
    )
      return `Moving your ${pieceNames[previous.piece]} off ${previous.from} left the ${pieceNames[captured]} on ${move.to} without a defender. ${side} took it. ${materialSummary(after)}`;
    if (earlier.attackers(move.to, move.color).includes(move.from))
      return `Your last move left the ${pieceNames[captured]} on ${move.to} under attack. After this capture you have no immediate recapture there. ${materialSummary(after)}`;
  }
  return canRecapture
    ? `${side} picks up the ${pieceNames[captured]}, but ${opponent} can immediately recapture on ${move.to}.`
    : `${opponent} cannot immediately recapture on ${move.to}. ${materialSummary(after)}`;
}

export function explainContinuation(
  move: Move,
  after: Chess,
  previous?: Move,
): string {
  const before = new Chess(move.before);
  const side = move.color === "w" ? "White" : "Black";
  const opponent = move.color === "w" ? "Black" : "White";
  const piece = pieceNames[move.promotion ?? move.piece];
  if (after.isCheckmate())
    return `This check ends the game. ${opponent} has no legal way to save the king.`;
  if (after.isDraw()) {
    if (after.isStalemate())
      return `${opponent} has no legal move and is out of check, so the position is a draw.`;
    if (after.isInsufficientMaterial())
      return "There is too little material left for either side to give mate.";
    if (after.isThreefoldRepetition())
      return "This position has appeared three times, so the continuation is drawn.";
    return "Fifty moves by each side without a pawn move or capture make this a draw.";
  }

  const pieces = after
    .board()
    .flat()
    .filter((p) => p !== null)
    .sort((a, b) => priority[b.type] - priority[a.type]);
  const targets = pieces.filter(
    (target) => target.color === after.turn() && target.type !== "k",
  );
  // Compare the same attacker across the move, including stationary pieces revealed behind it.
  const newAttacks = targets.flatMap((target) => {
    const oldAttackers = before.attackers(target.square, move.color);
    const attacker = after
      .attackers(target.square, move.color)
      .find(
        (square) =>
          !oldAttackers.includes(square === move.to ? move.from : square),
      );
    return attacker === undefined ? [] : [{ target, attacker }];
  });
  const threat = newAttacks[0];
  const checking = after.isCheck();
  if (
    previous?.captured !== undefined &&
    previous.to === move.to &&
    move.captured !== undefined
  ) {
    const queensGone =
      previous.captured === "q" &&
      move.captured === "q" &&
      !pieces.some((p) => p.type === "q");
    const result = queensGone
      ? "Both queens are off the board."
      : `Across those two moves, ${opponent} gave up a ${pieceNames[move.captured]} for a ${pieceNames[previous.captured]}.`;
    return `${result} ${materialSummary(after)}${checking ? ` ${opponent} must also answer the check.` : ""}`;
  }

  if (checking) {
    const onlyReply = after.moves().length === 1;
    const constraint = onlyReply
      ? `${opponent} has only one legal reply.`
      : `${opponent} must answer the check immediately.`;
    if (move.captured !== undefined)
      return `${side} takes the ${pieceNames[move.captured]} with check. ${constraint}`;
    if (threat && threat.target.type !== "p")
      return `The king is in check and the ${pieceNames[threat.target.type]} on ${threat.target.square} is under new pressure. ${constraint}`;
    return onlyReply
      ? `This check leaves ${opponent} just one legal reply.`
      : `${opponent} has to spend this turn getting out of check.`;
  }

  if (move.captured !== undefined)
    return explainCapture(move, move.captured, before, after, previous);
  if (before.isCheck()) {
    if (move.piece !== "k")
      return `The ${piece} blocks the checking line on ${move.to}, so the king can stay on its square.`;
    return `The king escapes the check on ${move.to}. ${opponent} has to create a fresh threat to keep checking.`;
  }
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `Castling moves the king away from the center and brings the rook to ${move.isKingsideCastle() ? "f" : "d"}${move.to.slice(1)} in the same turn.`;

  const exposed = pieces.find(
    (target) =>
      target.color === move.color &&
      target.type !== "k" &&
      target.type !== "p" &&
      !after.isAttacked(target.square, move.color) &&
      after.isAttacked(target.square, after.turn()) &&
      (target.square === move.to ||
        before.isAttacked(target.square, move.color) ||
        !before.isAttacked(target.square, after.turn())),
  );
  if (
    exposed &&
    after
      .moves({ verbose: true })
      .some(
        (reply) =>
          reply.to === exposed.square && reply.captured === exposed.type,
      )
  ) {
    return `The ${pieceNames[exposed.type]} on ${exposed.square} is exposed. ${opponent} can take it there and no piece guards that square.`;
  }
  if (move.isPromotion())
    return `The pawn is now a ${piece} on ${move.to}. ${materialSummary(after)}`;
  if (threat && threat.target.type !== "p") {
    const target = `${pieceNames[threat.target.type]} on ${threat.target.square}`;
    const attacker = after.get(threat.attacker);
    const kingSquare = after.findPiece({ type: "k", color: after.turn() })[0];
    if (attacker && kingSquare && ["b", "r", "q"].includes(attacker.type)) {
      const withoutTarget = new Chess(after.fen());
      withoutTarget.remove(threat.target.square);
      if (
        withoutTarget
          .attackers(kingSquare, move.color)
          .includes(threat.attacker)
      )
        return `The ${pieceNames[attacker.type]} pins the ${target} to its king. It cannot leave that line while the king is behind it.`;
    }
    if (threat.target.square === previous?.to) {
      const otherTarget = newAttacks.find(
        (other) =>
          other.attacker === threat.attacker &&
          other.target.square !== previous.to,
      );
      if (otherTarget)
        return `Your ${pieceNames[threat.target.type]} on ${previous.to} is now under attack. The same ${pieceNames[attacker?.type ?? move.piece]} also attacks your ${pieceNames[otherTarget.target.type]} on ${otherTarget.target.square}.`;
      return `${side} puts pressure on the ${pieceNames[threat.target.type]} you just moved to ${previous.to}. ${after.isAttacked(previous.to, after.turn()) ? "It has support on that square." : "Nothing else guards it there."}`;
    }
    if (attacker && threat.attacker !== move.to)
      return `Leaving ${move.from} opens a line for the ${pieceNames[attacker.type]} on ${threat.attacker} to attack the ${target}.`;
    const second = newAttacks.find(
      (other) =>
        other.attacker === threat.attacker &&
        other.target.square !== threat.target.square &&
        other.target.type !== "p",
    );
    if (second)
      return `From ${move.to} the ${piece} attacks two pieces at once: the ${target} and the ${pieceNames[second.target.type]} on ${second.target.square}.`;
    return `The ${target} now faces pressure from the ${piece}. ${after.isAttacked(threat.target.square, after.turn()) ? "It has a defender, so taking it could lead to an exchange." : "No other piece guards it."}`;
  }
  if (
    before.isAttacked(move.from, after.turn()) &&
    !after.isAttacked(move.to, after.turn())
  )
    return `The ${piece} escapes the attack on ${move.from}. No enemy piece attacks it on ${move.to}.`;
  const protectedPiece = pieces.find(
    (target) =>
      target.color === move.color &&
      target.type !== "k" &&
      target.square !== move.to &&
      after.isAttacked(target.square, after.turn()) &&
      !before.isAttacked(target.square, move.color) &&
      after.isAttacked(target.square, move.color),
  );
  if (protectedPiece)
    return `The attacked ${pieceNames[protectedPiece.type]} on ${protectedPiece.square} now has support. It was undefended before this move.`;
  const opened = pieces.find(
    (target) =>
      target.color === move.color &&
      ["q", "b", "r"].includes(target.type) &&
      target.square !== move.to &&
      after.attackers(move.from, move.color).includes(target.square) &&
      SQUARES.some(
        (sq) =>
          !after.get(sq) &&
          after.attackers(sq, move.color).includes(target.square) &&
          !before.attackers(sq, move.color).includes(target.square),
      ),
  );
  if (opened)
    return `Vacating ${move.from} opens a line for the ${pieceNames[opened.type]} on ${opened.square}, giving it more room along that line.`;
  const gained = [...center, ...SQUARES].find(
    (sq) =>
      after.attackers(sq, move.color).includes(move.to) &&
      !before.attackers(sq, move.color).includes(move.from),
  );
  if (gained) {
    if (center.includes(gained))
      return `The ${piece} now covers ${gained}, adding pressure in the center.`;
    if (threat)
      return `The pawn on ${threat.target.square} is now under pressure from ${side}.`;
    return `From ${move.to}, the ${piece} now covers ${gained}. That square was outside its reach on ${move.from}.`;
  }
  return `The ${piece} on ${move.to} ${after.isAttacked(move.to, move.color) ? "has support from another piece" : "has no defender"}. ${materialSummary(after)}`;
}
