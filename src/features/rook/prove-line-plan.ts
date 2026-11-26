import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { pieceNames } from "../board/board-pieces";
import { materialBalance } from "../../domain/game/board-balance";
import { checkingMate } from "./checking-mate";
import { explainChangedReply, explainLinePlan } from "./explain-line-step";

// Versioned, model-authored phrasing shipped with the client. All dynamic values
// come from the exact branch on which chess.js verified the relationship.
const wording = {
  author: "OpenAI Codex",
  version: "checked-move-consequences/2",
} as const;
const side = (color: "w" | "b") => (color === "w" ? "White" : "Black");
const value: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};
interface Plan {
  readonly text: string;
  readonly step: number;
  readonly source: typeof wording;
}
type BranchSearch = (
  fen: string,
  signal: AbortSignal,
) => Promise<readonly string[]>;
interface Candidate {
  text: string;
  step: number;
  rank: number;
}

function samePiece(board: Chess, square: Square, move: Move) {
  const p = board.get(square);
  return p?.color === move.color && p.type === move.piece;
}

function follows(line: readonly Move[]) {
  return line.every((move, i) => i === 0 || line[i - 1]?.after === move.before);
}

function aligned(from: Square, to: Square, middle: Square) {
  const dx = to.charCodeAt(0) - from.charCodeAt(0),
    dy = Number(to[1]) - Number(from[1]);
  const x = middle.charCodeAt(0) - from.charCodeAt(0),
    y = Number(middle[1]) - Number(from[1]);
  return (
    x * dy === y * dx &&
    x * dx + y * dy > 0 &&
    x * dx + y * dy < dx * dx + dy * dy
  );
}

// Track the actual piece rather than treating two rooks of the same color as interchangeable.
function staysOn(square: Square, between: readonly Move[]) {
  return between.every(
    (move) =>
      move.from !== square &&
      move.to !== square &&
      !move.isEnPassant() &&
      !move.isKingsideCastle() &&
      !move.isQueensideCastle(),
  );
}

function followsPawn(first: Move, steps: readonly Move[], payoff: Move) {
  let square = first.to;
  for (const move of steps) {
    if (move.to === square || move.isEnPassant()) return false;
    if (move.from !== square) continue;
    if (move.color !== first.color || move.piece !== "p") return false;
    if (move.promotion) return move === payoff;
    square = move.to;
  }
  return false;
}

function checkedCandidate(
  line: readonly Move[],
  attempted: readonly Move[],
): Candidate | null {
  const [first, response] = line;
  const [tried, otherReply] = attempted;
  if (!first || !response || !tried || !otherReply) return null;
  const root = new Chess(first.before),
    alternative = new Chess(tried.after);
  const perspective = first.color === "w" ? 1 : -1;
  const openingBalance = materialBalance(first.before) * perspective;
  const contrast = ` After ${tried.san}, the checked reply is ${otherReply.san}.`;
  const candidates: Candidate[] = [];
  // A checked capture can buy a tempo before the move the player chose immediately.
  const delayed = line[2];
  if (
    first.captured &&
    first.san.endsWith("+") &&
    delayed?.lan === tried.lan &&
    delayed.captured === tried.captured &&
    tried.captured &&
    materialBalance(response.after) * perspective > openingBalance &&
    alternative.get(first.to)?.color === response.color &&
    alternative.get(first.to)?.type === first.captured
  ) {
    candidates.push({
      step: 2,
      rank: 8 + value[first.captured],
      text: `${first.san} takes the ${pieceNames[first.captured]} with check. After ${response.san}, ${delayed.san} still takes the ${pieceNames[tried.captured]}. Playing ${tried.san} first leaves the ${pieceNames[first.captured]} on ${first.to}.`,
    });
  }
  for (let i = 2; i < line.length; i += 2) {
    const move = line[i];
    if (!move || (!move.captured && !move.promotion && !move.san.endsWith("#")))
      continue;
    const terminal =
      move.san.endsWith("#") && new Chess(move.after).isCheckmate();
    const outcome = terminal
      ? `${move.san} checkmates`
      : move.promotion
        ? `${move.san} promotes to a ${pieceNames[move.promotion]}`
        : move.captured
          ? `${move.san} takes the ${pieceNames[move.captured]} on ${move.to}`
          : null;
    if (!outcome) continue;
    const nextReply = line[i + 1];
    const settled =
      nextReply?.after ??
      (move.captured &&
      !new Chess(move.after)
        .moves({ verbose: true })
        .some((m) => m.isCapture() && m.to === move.to)
        ? move.after
        : undefined);
    // A capture at the horizon may be immediately recaptured. Do not select a
    // temporary material swing as the payoff of the whole line.
    const gain = settled
      ? materialBalance(settled) * perspective - openingBalance
      : 0;
    if (!terminal && !move.promotion && (gain <= 0 || !settled)) continue;
    const rank =
      (terminal ? 100 : move.promotion ? 20 : 0) +
      Math.min(gain, 10) * 2 +
      (move.captured ? value[move.captured] : 0);
    const propose = (text: string, extra = 0) =>
      candidates.push({ step: i, rank: rank + extra, text });

    for (const [index, setup] of [first, response].entries()) {
      const between = line.slice(index + 1, i);
      const afterSetup = new Chess(setup.after);
      const beforeSetup = new Chess(setup.before);
      const prefix =
        index === 1
          ? `If ${side(response.color)} answers ${first.san} with ${response.san},`
          : `With ${first.san},`;
      // A stationary sliding piece gained the actual capture ray when a blocker left.
      if (
        ["q", "r", "b"].includes(move.piece) &&
        aligned(move.from, move.to, setup.from) &&
        samePiece(beforeSetup, move.from, move) &&
        staysOn(move.from, between) &&
        !beforeSetup.attackers(move.to, move.color).includes(move.from) &&
        afterSetup.attackers(move.to, move.color).includes(move.from) &&
        between.every(
          (m) =>
            !aligned(move.from, move.to, m.to) &&
            !m.isEnPassant() &&
            !m.isKingsideCastle() &&
            !m.isQueensideCastle(),
        )
      ) {
        const remains =
          samePiece(alternative, setup.from, setup) &&
          samePiece(alternative, move.from, move)
            ? ` After ${tried.san}, the ${pieceNames[setup.piece]} still blocks that line on ${setup.from}.`
            : contrast;
        propose(
          `${prefix} the ${pieceNames[setup.piece]} leaves ${setup.from}, opening the ${pieceNames[move.piece]}'s line from ${move.from} to ${move.to}. In the checked continuation, ${outcome}.${remains}`,
          3,
        );
      }
    }
    // Follow the original piece forward to a later check, then trace the
    // captured piece back to the square it occupied while answering that check.
    if (move.captured) {
      for (let j = 2; j + 1 < i; j += 2) {
        const check = line[j],
          answer = line[j + 1];
        if (
          !check ||
          !answer ||
          !check.san.endsWith("+") ||
          check.from !== first.to ||
          check.piece !== first.piece ||
          !staysOn(first.to, line.slice(1, j)) ||
          answer.to !== move.to ||
          answer.piece !== move.captured ||
          answer.promotion ||
          !staysOn(move.to, line.slice(j + 2, i))
        )
          continue;
        const opening = line
          .slice(1, j)
          .findLast((m) => m.from === check.to || m.to === check.to);
        const cleared =
          opening?.from === check.to
            ? ` ${opening.san} clears ${check.to}.`
            : "";
        propose(
          `${first.san} puts the ${pieceNames[first.piece]} on ${first.to} for ${check.san}.${cleared} ${side(answer.color)}’s ${pieceNames[answer.piece]} went to ${answer.to} to answer the check. Later, ${outcome}.${contrast}`,
          5,
        );
      }
    }
    // The reply to the first check placed the eventual victim on the capture square.
    if (
      first.san.endsWith("+") &&
      response.to === move.to &&
      response.piece === move.captured &&
      !response.promotion &&
      staysOn(move.to, line.slice(2, i))
    ) {
      const remains = samePiece(alternative, response.from, response)
        ? ` After ${tried.san}, that ${pieceNames[response.piece]} is still on ${response.from}.`
        : contrast;
      propose(
        `If ${side(response.color)} answers ${first.san} with ${response.san}, the ${pieceNames[response.piece]} lands on ${move.to}. Later in the line, ${outcome}.${remains}`,
        2,
      );
    }
    // Verify the change in reach before and after relocating the very same piece.
    if (
      first.to === move.from &&
      first.piece === move.piece &&
      staysOn(move.from, line.slice(1, i)) &&
      !root.attackers(move.to, move.color).includes(first.from) &&
      new Chess(first.after).attackers(move.to, move.color).includes(first.to)
    ) {
      propose(
        `${first.san} brings the ${pieceNames[first.piece]} from ${first.from} to ${first.to}, where it now attacks ${move.to}. After ${response.san}, the checked line continues until ${outcome}.${contrast}`,
      );
    }
    // A preparation changes what the identical move achieves on a different board.
    const fork = line[i - 2],
      king = line[i - 1];
    if (
      fork &&
      king &&
      fork.piece === move.piece &&
      fork.to === move.from &&
      fork.san.endsWith("+") &&
      king.piece === "k" &&
      move.captured &&
      fork.lan === tried.lan &&
      fork.san !== tried.san &&
      !tried.san.endsWith("+") &&
      new Chess(fork.after).attackers(move.to, move.color).includes(fork.to) &&
      otherReply.to === tried.to &&
      otherReply.captured === tried.piece
    ) {
      propose(
        `After ${first.san} ${response.san}, ${fork.san} checks the king and attacks the ${pieceNames[move.captured]} on ${move.to}. After ${king.san}, ${outcome}. Played immediately, ${tried.san} lets ${otherReply.san} take the ${pieceNames[tried.piece]}.`,
        9,
      );
    }
    if (
      move.promotion &&
      first.piece === "p" &&
      otherReply.to === first.from &&
      otherReply.captured === "p" &&
      followsPawn(first, line.slice(1, i + 1), move)
    ) {
      propose(
        `${first.san} moves the pawn away from ${first.from} before it can be taken there. After ${response.san}, ${outcome} in this line. With ${tried.san} first, ${otherReply.san} captures that pawn on ${first.from}.`,
        5,
      );
    }
  }
  return (
    candidates.sort((a, b) => b.rank - a.rank || a.step - b.step)[0] ?? null
  );
}

export async function proveLinePlan(
  line: readonly Move[],
  attempted: readonly Move[],
  signal: AbortSignal,
  search?: BranchSearch,
): Promise<Plan | null> {
  const cancelled = () => signal.aborted;
  const [first, mainReply] = line;
  const [tried] = attempted;
  if (
    cancelled() ||
    !first ||
    !tried ||
    !follows(line) ||
    !follows(attempted) ||
    first.before !== tried.before ||
    first.lan === tried.lan
  )
    return null;
  const board = new Chess(first.before);
  board.move(first.lan);
  if (board.isCheckmate()) {
    const plan = explainLinePlan(line, attempted);
    return plan ? { ...plan, source: wording } : null;
  }
  const direct = () => {
    const cue = explainChangedReply(line, attempted, true);
    return cue ? { ...cue, source: wording } : null;
  };
  if (!mainReply) return direct();
  const main = checkedCandidate(line, attempted);
  let best = main;
  let extra = "";
  if (board.isCheck()) {
    const alternatives = board
      .moves({ verbose: true })
      .filter((r) => r.lan !== mainReply.lan);
    // Follow the player's natural "what if I take it?" on the actual board.
    // A separate branch is never presented as part of the main-line replay.
    const replies = alternatives.filter(
      (r) => r.to === first.to && r.isCapture(),
    );
    for (const reply of replies.slice(0, 2)) {
      if (cancelled()) return null;
      const branch = new Chess(first.before);
      branch.move(first.lan);
      branch.move(reply.lan);
      const mate = await checkingMate(
        branch,
        first.color,
        signal,
        performance.now() + 400,
      );
      if (cancelled()) return null;
      if (mate) {
        const note = `If ${side(reply.color)} plays ${reply.san}, ${mate.first} forces mate in at most ${String(mate.within)} ${mate.within === 1 ? "move" : "moves"}.`;
        if (main) {
          extra = " " + note;
          break;
        }
        if (
          alternatives.length === 1 &&
          line.some((m) => m.color === first.color && m.san.endsWith("#"))
        ) {
          const last = line.find((m) => m.san.endsWith("#"));
          if (last)
            best = {
              step: 0,
              rank: 100,
              text: `After ${first.san}, the checked ${mainReply.san} line ends in ${last.san}. ${note}`,
            };
        }
      } else if (search) {
        const moves = await search(branch.fen(), signal);
        if (cancelled()) return null;
        const branchLine = [first, reply];
        for (const uci of moves) branchLine.push(branch.move(uci));
        const candidate = checkedCandidate(branchLine, attempted);
        if (candidate && (!best || candidate.rank > best.rank)) {
          best = {
            ...candidate,
            step: 0,
            text: candidate.text.startsWith("If ")
              ? candidate.text
              : `One possible continuation is ${first.san} ${reply.san}. ${candidate.text}`,
          };
          extra = "";
        }
      }
    }
  }
  if (cancelled()) return null;
  return best
    ? { text: best.text + extra, step: best.step, source: wording }
    : direct();
}
