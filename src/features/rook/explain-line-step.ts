import { Chess, SQUARES, type Color, type Move, type Square } from "chess.js";

import { materialBalance } from "../../domain/game/board-balance";
import { pieceNames } from "../board/board-pieces";

const sideName = (color: Color) => (color === "w" ? "White" : "Black");

function mateExplanation(
  first: Move,
  attempted: readonly Move[],
  board: Chess,
) {
  const king = board.findPiece({ color: board.turn(), type: "k" })[0];
  if (!king) return null;
  const guards = new Map<Square, string>();
  const blockers: string[] = [];
  for (const square of SQUARES) {
    const fileDistance = Math.abs(square.charCodeAt(0) - king.charCodeAt(0));
    const rankDistance = Math.abs(
      Number(square.slice(1)) - Number(king.slice(1)),
    );
    if (square === king || fileDistance > 1 || rankDistance > 1) continue;
    const occupant = board.get(square);
    if (occupant?.color === board.turn()) {
      blockers.push(
        `${sideName(board.turn())}’s own ${pieceNames[occupant.type]} occupies ${square}`,
      );
      continue;
    }
    const escape = new Chess(board.fen());
    escape.remove(king);
    if (!escape.put({ color: board.turn(), type: "k" }, square)) continue;
    for (const origin of escape.attackers(square, first.color)) {
      const piece = escape.get(origin);
      if (piece && origin !== first.to && !guards.has(origin)) {
        guards.set(
          origin,
          `the ${pieceNames[piece.type]} on ${origin} covers ${square}`,
        );
        break;
      }
    }
  }
  const blocks = [...guards.values(), ...blockers].slice(0, 2).join(" and ");
  const [other, reply] = attempted;
  const contrast =
    other?.before === first.before && reply?.before === other.after
      ? ` After ${other.san}, ${sideName(reply.color)} can play ${reply.san}.`
      : "";
  return {
    step: 0,
    text: `${first.san} checks the king on ${king}${blocks ? ", and " + blocks : ""}. ${sideName(board.turn())} has no legal reply.${contrast}`,
  };
}

function explainChangedCapture(moves: readonly Move[], move: Move) {
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  const defenders = before.attackers(move.to, after.turn());
  const abandoned = moves.findLast(
    (earlier, index) =>
      earlier.color === after.turn() &&
      earlier.to !== move.to &&
      !defenders.includes(earlier.to) &&
      !moves
        .slice(index + 1)
        .some(
          (step) =>
            step.from === earlier.to ||
            step.to === earlier.to ||
            step.from === move.to ||
            step.to === move.to,
        ) &&
      new Chess(earlier.before).get(move.to)?.type === move.captured &&
      new Chess(earlier.before)
        .attackers(move.to, earlier.color)
        .includes(earlier.from),
  );
  if (
    abandoned &&
    move.captured &&
    !after
      .moves({ verbose: true })
      .some((answer) => answer.isCapture() && answer.to === move.to)
  ) {
    return `${sideName(abandoned.color)}’s ${pieceNames[abandoned.piece]} left ${abandoned.from} and no longer covers ${move.to}. ${sideName(move.color)} takes the ${pieceNames[move.captured]} there, and ${sideName(abandoned.color)} cannot recapture on ${move.to}.`;
  }

  const arrival = moves.findLast(
    (earlier) => earlier.to === move.from || earlier.from === move.from,
  );
  if (
    arrival?.to === move.from &&
    arrival.color === move.color &&
    !new Chess(arrival.before)
      .attackers(move.to, move.color)
      .includes(arrival.from) &&
    new Chess(arrival.after).attackers(move.to, move.color).includes(move.from)
  ) {
    return `${sideName(move.color)}’s ${pieceNames[move.piece]} moved to ${move.from} earlier and gained control of ${move.to}. It can take there now.`;
  }
  return null;
}

function explainOpenedPath(earlierMoves: readonly Move[], move: Move) {
  const opening = earlierMoves.findLast((earlier, step) => {
    if (
      earlier.from === move.from ||
      earlier.to === move.from ||
      earlier.from === move.to ||
      earlier.to === move.to ||
      earlierMoves
        .slice(step + 1)
        .some(({ from, to }) => from === move.from || to === move.from)
    )
      return false;
    const before = new Chess(earlier.before);
    const after = new Chess(earlier.after);
    const piece = before.get(move.from);
    return (
      piece?.type === move.piece &&
      piece.color === move.color &&
      !before.attackers(move.to, move.color).includes(move.from) &&
      after.attackers(move.to, move.color).includes(move.from)
    );
  });
  return opening
    ? `After ${opening.san}, the ${pieceNames[move.piece]} on ${move.from} gained a line to ${move.to}. ${sideName(move.color)} uses it now.`
    : null;
}

function explainNewOption(moves: readonly Move[], index: number, move: Move) {
  const previous = moves[index - 2];
  const intervening = moves[index - 1];
  if (!previous || !intervening || previous.color !== move.color) return null;
  const board = new Chess(previous.before);
  const piece = board.get(move.from);
  if (piece?.color !== move.color || piece.type !== move.piece) return null;

  if (!board.moves({ verbose: true }).some(({ lan }) => lan === move.lan)) {
    return `${sideName(move.color)} could not play ${move.san} before ${previous.san}. After ${sideName(intervening.color)} replies ${intervening.san}, ${sideName(move.color)} can play it${move.isPromotion() ? " and promote" : ""}.`;
  }

  if (!move.isPromotion()) return null;
  board.move(move.lan);
  const oldCapture = board
    .moves({ verbose: true })
    .find((reply) => reply.to === move.to && reply.isCapture());
  if (!oldCapture) return null;
  board.move(oldCapture.lan);
  if (
    board
      .moves({ verbose: true })
      .some((reply) => reply.to === move.to && reply.isCapture())
  )
    return null;

  const actual = new Chess(move.after);
  const capture = actual
    .moves({ verbose: true })
    .find(({ lan }) => lan === oldCapture.lan);
  if (!capture)
    return `${previous.san} and ${intervening.san} make promotion possible without ${oldCapture.san}, which could take the new piece earlier.`;
  actual.move(capture.lan);
  const recapture = actual
    .moves({ verbose: true })
    .find((reply) => reply.to === move.to && reply.isCapture());
  return recapture
    ? `${previous.san} and ${intervening.san} change the promotion exchange. If ${capture.san} takes the new piece, ${recapture.san} takes back. The recapture was unavailable before.`
    : null;
}

export function explainLineStep(moves: readonly Move[], index: number) {
  const move = moves[index];
  if (!move) return null;

  if (move.isPromotion()) {
    const newOption = explainNewOption(moves, index, move);
    if (newOption) return newOption;
  }

  if (move.captured) {
    const earlierMoves = moves.slice(0, index);
    const lastOnSquare = earlierMoves.findLast(
      (earlier) => earlier.to === move.to || earlier.from === move.to,
    );
    if (
      lastOnSquare?.to === move.to &&
      lastOnSquare.color !== move.color &&
      lastOnSquare.piece === move.captured &&
      new Chess(lastOnSquare.before).isCheck()
    ) {
      return `${sideName(lastOnSquare.color)}’s ${pieceNames[move.captured]} went to ${move.to} to answer the check. ${sideName(move.color)} takes it now.`;
    }
    const changedCapture = explainChangedCapture(earlierMoves, move);
    if (changedCapture) return changedCapture;
  }

  const reply = moves[index + 1];
  const followUp = moves[index + 2];
  if (
    reply?.captured === move.piece &&
    reply.to === move.to &&
    followUp?.to === reply.from
  ) {
    return `If ${sideName(reply.color)} takes with the ${pieceNames[reply.piece]} on ${reply.from}, that square opens for ${sideName(followUp.color)}’s ${pieceNames[followUp.piece]}.`;
  }
  if (move.captured && reply?.to === move.from) {
    return `The capture clears ${move.from} for ${sideName(reply.color)}’s ${pieceNames[reply.piece]}.`;
  }
  const previous = moves[index - 1];
  if (
    previous?.captured &&
    reply &&
    followUp?.to === previous.to &&
    followUp.captured === previous.piece &&
    reply.from !== previous.to &&
    reply.to !== previous.to &&
    new Chess(move.after).isCheck() &&
    new Chess(move.before)
      .moves({ verbose: true })
      .some(
        (immediate) =>
          immediate.to === previous.to && immediate.captured === previous.piece,
      )
  ) {
    return `In this line, ${sideName(move.color)} checks first, then takes the ${pieceNames[previous.piece]} on ${previous.to}.`;
  }
  if (previous?.captured && previous.from === move.to) {
    const check = new Chess(move.after).isCheck() ? " with check" : "";
    return `${sideName(move.color)}’s ${pieceNames[move.piece]} uses the square that the capture opened${check}.`;
  }
  if (
    previous?.piece === "k" &&
    new Chess(previous.before).isCheck() &&
    new Chess(move.after).isCheck()
  ) {
    const result = new Chess(move.after).isCheckmate()
      ? "This time the king has no legal reply."
      : `${sideName(move.color)} checks it again there.`;
    return `The last check brought the king to ${previous.to}. ${result}`;
  }
  if (move.captured || new Chess(move.after).isCheck()) {
    return (
      explainOpenedPath(moves.slice(0, index), move) ??
      explainNewOption(moves, index, move)
    );
  }
  return null;
}

export function explainLinePlan(
  moves: readonly Move[],
  attempted: readonly Move[] = [],
) {
  const first = moves[0];
  if (!first) return null;
  const afterFirst = new Chess(first.after);
  if (afterFirst.isCheckmate())
    return mateExplanation(first, attempted, afterFirst);
  const perspective = first.color === "w" ? 1 : -1;
  const startingMaterial = materialBalance(first.before) * perspective;
  const checked = moves.flatMap((move, step) => {
    const explanation = explainLineStep(moves, step);
    return explanation ? [{ move, step, explanation }] : [];
  });
  const [payoff] = checked
    .flatMap((fact) => {
      const { move, step } = fact;
      if (move.color !== first.color) return [];
      const after = new Chess(move.after);
      const settledStep = moves[step + 1] ? step + 1 : step;
      const settled = moves[settledStep]?.after ?? move.after;
      // Allow the immediate reply before claiming that a material gain holds.
      const activeMaterial = materialBalance(settled) * perspective;
      const attemptedAfter = attempted[settledStep]?.after;
      const referenceMaterial = attemptedAfter
        ? materialBalance(attemptedAfter) * perspective
        : startingMaterial;
      const gain = activeMaterial - referenceMaterial;
      const localGain =
        activeMaterial - materialBalance(move.before) * perspective;
      const wins = after.isCheckmate() || gain > 0 || localGain > 0;
      return wins
        ? [{ ...fact, mate: Number(after.isCheckmate()), localGain }]
        : [];
    })
    .toSorted(
      (left, right) =>
        right.mate - left.mate ||
        right.localGain - left.localGain ||
        left.step - right.step,
    );
  if (!payoff) return explainChangedReply(moves, attempted);

  const setup = checked.find(
    ({ move, step }) => step < payoff.step && move.from === payoff.move.to,
  );
  const steps = setup ? [setup, payoff] : [payoff];
  let bridge = "";
  if (!setup && payoff.move.captured) {
    const earlier = moves.slice(1, payoff.step);
    const defenderIndex = earlier.findLastIndex(
      (move) =>
        move.color !== first.color &&
        new Chess(move.before)
          .attackers(payoff.move.to, move.color)
          .includes(move.from) &&
        !new Chess(move.after)
          .attackers(payoff.move.to, move.color)
          .includes(move.to),
    );
    const defender = earlier[defenderIndex];
    const proposal = moves[defenderIndex];
    if (defender && proposal && new Chess(proposal.after).isCheck())
      bridge = `${proposal.san} is followed by ${defender.san}. `;
  }
  return {
    step: payoff.step,
    text:
      bridge +
      steps
        .map(({ move, explanation }) => `${move.san}. ${explanation}`)
        .join(" "),
  };
}

export function explainChangedReply(
  line: readonly Move[],
  attempted: readonly Move[],
  directOnly = false,
) {
  const [found] = line;
  const [played, reply] = attempted;
  if (!found || !played || !reply) return null;
  const stronger = new Chess(found.after);
  const responses = stronger.moves({ verbose: true });
  const canRepeat = responses.find((move) => move.lan === reply.lan);
  if (
    directOnly &&
    new Chess(reply.after).isCheckmate() &&
    !responses.some((move) => move.san.endsWith("#"))
  ) {
    const escape = canRepeat?.san.endsWith("+")
      ? new Chess(canRepeat.after).moves()[0]
      : undefined;
    return {
      step: 0,
      text: `After ${played.san}, ${reply.san} checkmates. With ${found.san}, ${sideName(reply.color)} has no mate in one.${canRepeat && escape ? ` If ${canRepeat.san}, ${escape} answers the check.` : ""}`,
    };
  }
  if (
    directOnly &&
    reply.captured &&
    !reply.isEnPassant() &&
    !played.promotion &&
    !new Chess(reply.after)
      .moves({ verbose: true })
      .some((m) => m.isCapture() && m.to === reply.to)
  ) {
    const endangered = reply.to === played.to ? played.from : reply.to;
    const safeSquare = found.from === endangered ? found.to : endangered;
    const saved = stronger.get(safeSquare);
    if (
      (safeSquare !== reply.to || !stronger.isCheck()) &&
      saved?.color === found.color &&
      saved.type === reply.captured &&
      !responses.some(
        (m) =>
          m.isCapture() &&
          (m.to === safeSquare ||
            (m.isEnPassant() &&
              safeSquare === m.to.charAt(0) + m.from.charAt(1))),
      )
    ) {
      return {
        step: 0,
        text: `After ${played.san}, ${reply.san} takes your ${pieceNames[reply.captured]} on ${reply.to} with no immediate recapture. After ${found.san}, your ${pieceNames[reply.captured]} on ${safeSquare} cannot be taken immediately.`,
      };
    }
  }
  if (!canRepeat && found.to === reply.from && found.captured) {
    return {
      step: 0,
      text: `${found.san} takes the ${pieceNames[found.captured]} that could play ${reply.san} after ${played.san}.`,
    };
  }
  if (
    !canRepeat &&
    reply.captured &&
    found.from === reply.to &&
    found.piece === reply.captured
  ) {
    return {
      step: 0,
      text: `${found.san} moves the ${pieceNames[found.piece]} away from ${found.from}, where ${reply.san} could take it after ${played.san}.`,
    };
  }
  if (!canRepeat)
    return directOnly
      ? null
      : explainDeniedReply(line, attempted, found, played, reply);
  if (!canRepeat.captured || canRepeat.captured !== reply.captured) return null;

  stronger.move(canRepeat.lan);
  const recapture = (board: Chess) =>
    board
      .moves({ verbose: true })
      .find((move) => move.to === reply.to && move.isCapture());
  const defense = recapture(stronger);
  return defense && !recapture(new Chess(reply.after))
    ? {
        step: 0,
        text: `After ${found.san}, if ${canRepeat.san} takes the ${pieceNames[canRepeat.captured]} on ${canRepeat.to}, ${defense.san} takes back. After ${played.san} ${reply.san}, that recapture is unavailable.`,
      }
    : null;
}

function explainDeniedReply(
  line: readonly Move[],
  attempted: readonly Move[],
  found: Move,
  played: Move,
  reply: Move,
) {
  const length = Math.min(line.length, attempted.length);
  const playedEnd = attempted[length - 1];
  const foundEnd = line[length - 1];
  if (!playedEnd || !foundEnd) return null;
  const lostByMate =
    playedEnd.color === reply.color && new Chess(playedEnd.after).isCheckmate();
  if (lostByMate && !new Chess(foundEnd.after).isCheckmate()) {
    return {
      step: 0,
      text: `After ${played.san}, ${reply.san} starts a checked mating line. After ${found.san}, that reply is unavailable.`,
    };
  }
  const perspective = found.color === "w" ? 1 : -1;
  const original = materialBalance(played.before) * perspective;
  const lost = materialBalance(playedEnd.after) * perspective;
  const kept = materialBalance(foundEnd.after) * perspective;
  return lost < original && kept > lost
    ? {
        step: 0,
        text: `After ${played.san}, ${reply.san} starts a line that costs material. After ${found.san}, that reply is unavailable and the checked continuation keeps more material.`,
      }
    : null;
}
