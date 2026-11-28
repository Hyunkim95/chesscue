import { Chess, type Color, type Move, type Square } from "chess.js";

import {
  PIECE_NAME,
  PIECE_VALUE,
  fileOf,
  opponent,
  rankOf,
  squareAt,
} from "./board-relations";

// The checked reasons a best move is good, for a writer to phrase. Every
// fact comes from chess.js replaying a Stockfish line: what the move takes
// and who can take back, what it attacks or uncovers, its threat if the
// opponent could pass, the opponent's best defences and what the player's
// own game move allowed. Counts are the player's material balance, never a
// gain. research_notes/why-explanations/scorecard.md, round 2.
export const WHY_PACKET_VERSION = "why-packet/1";

export interface WhyInput {
  readonly fen: string;
  // Stockfish's line, starting with the best move, in UCI.
  readonly bestLine: readonly string[];
  // The move the player chose in the game, when it was not the best move.
  readonly gameMoveUci?: string | undefined;
  // The opponent's move that led to `fen`, to tell a recapture.
  readonly previous?:
    | { readonly fen: string; readonly uci: string }
    | undefined;
}

// A position code needs Stockfish's top `multiPv` lines for.
export interface WhySearch {
  readonly key: string;
  readonly fen: string;
  readonly multiPv: number;
}

// Stockfish's lines for each search key, each line in UCI from that
// search's position.
export type WhyLines = ReadonlyMap<string, readonly (readonly string[])[]>;

export interface WhyStep {
  readonly move: string;
  readonly takes?: string;
  readonly check?: true;
  // The balance after this move, such as "3 points ahead" or "level".
  readonly afterwards: string;
}

export interface WhyLine {
  readonly san: readonly string[];
  readonly steps: readonly WhyStep[];
  // "checkmate by White", or the balance at the end.
  readonly endsWith: string;
}

export interface WhyPacket {
  readonly fen: string;
  readonly youAre: "White" | "Black";
  readonly materialNow: string;
  readonly previousMove: string | null;
  readonly bestMove: string;
  readonly bestMoveGivesCheck: boolean;
  readonly bestMoveCaptures: {
    readonly takes: string;
    readonly isRecapture: boolean;
    readonly canTakeBack: readonly string[];
    readonly attackersThatArePinned: readonly {
      readonly piece: string;
      readonly pinnedBy: string | null;
    }[];
  } | null;
  readonly bestMoveOpensLines: readonly {
    readonly piece: string;
    readonly attacks: string;
  }[];
  // A king is never called defended or undefended.
  readonly bestMoveAttacks: readonly {
    readonly target: string;
    readonly defended?: boolean;
  }[];
  readonly bestMoveLinesUp: readonly {
    readonly front: string;
    readonly behind: string;
  }[];
  readonly threatAfterBestMove: {
    readonly move: string;
    readonly line: readonly WhyStep[];
    readonly endsWith: string;
  } | null;
  readonly bestLine: WhyLine;
  readonly opponentDefences: readonly {
    readonly defence: string;
    readonly line: readonly WhyStep[];
    readonly endsWith: string;
  }[];
  readonly otherRecaptures: readonly {
    readonly move: string;
    readonly line: readonly WhyStep[];
    readonly endsWith: string;
  }[];
  readonly yourGameMove: {
    readonly move: string;
    readonly line: readonly WhyStep[];
    readonly endsWith: string;
  } | null;
}

const SIDE = { w: "White", b: "Black" } as const;
// A threat counts when it wins at least this much once captures settle.
const THREAT_POINTS = 2;
// A line is read this far, then on until no capture or promotion for this
// many plies.
const STABLE_PLIES = 4;

function balance(board: Chess, us: Color): number {
  let sum = 0;
  for (const piece of board.board().flat())
    if (piece) sum += (piece.color === us ? 1 : -1) * PIECE_VALUE[piece.type];
  return sum;
}

// A count fragment the writer may copy: "3 points ahead", "1 point behind"
// or "level".
export function standing(points: number): string {
  if (points === 0) return "level";
  const n = Math.abs(points);
  return `${String(n)} point${n === 1 ? "" : "s"} ${points > 0 ? "ahead" : "behind"}`;
}

function play(board: Chess, uci: string): Move | undefined {
  try {
    return board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
  } catch {
    return undefined;
  }
}

function at(fen: string): Chess | undefined {
  try {
    return new Chess(fen);
  } catch {
    return undefined;
  }
}

function label(board: Chess, square: Square): string {
  const piece = board.get(square);
  return piece ? `${PIECE_NAME[piece.type]} on ${square}` : square;
}

// A line read for `plies` moves and on until captures settle, with the
// balance for `us` after every move. `points` stays with code: the writer
// only sees the fragments.
function readLine(
  fen: string,
  line: readonly string[],
  us: Color,
  plies: number,
): (WhyLine & { readonly points: number; readonly mate: boolean }) | undefined {
  const board = at(fen);
  if (!board) return undefined;
  const moves: Move[] = [];
  for (const uci of line) {
    if (board.isGameOver()) break;
    const move = play(board, uci);
    if (!move) break;
    moves.push(move);
  }
  let end = Math.min(plies, moves.length);
  for (let i = end; i < moves.length && i < end + STABLE_PLIES; i++)
    if (moves[i]?.captured !== undefined || moves[i]?.promotion !== undefined)
      end = i + 1;
  const replay = new Chess(fen);
  const steps = moves.slice(0, end).map((move): WhyStep => {
    replay.move(move.lan);
    return {
      move: `${SIDE[move.color]} ${move.san}`,
      ...(move.captured
        ? { takes: `the ${PIECE_NAME[move.captured]} on ${move.to}` }
        : {}),
      ...(replay.inCheck() ? { check: true as const } : {}),
      afterwards: standing(balance(replay, us)),
    };
  });
  return {
    san: moves.slice(0, end).map(({ san }) => san),
    steps,
    endsWith: replay.isCheckmate()
      ? `checkmate by ${SIDE[opponent(replay.turn())]}`
      : standing(balance(replay, us)),
    points: balance(replay, us),
    mate: replay.isCheckmate(),
  };
}

function shown({ san, steps, endsWith }: WhyLine): WhyLine {
  return { san, steps, endsWith };
}

// The same position with the opponent's turn skipped. Asked only when the
// opponent is not in check, so the result is a legal position.
function passed(fen: string): string | undefined {
  const [placement, turn, castling] = fen.split(" ");
  if (placement === undefined || turn === undefined) return undefined;
  const flipped = [
    placement,
    turn === "w" ? "b" : "w",
    castling ?? "-",
    "-",
    "0",
    "1",
  ];
  return at(flipped.join(" ")) ? flipped.join(" ") : undefined;
}

function previousMove(input: WhyInput): Move | undefined {
  if (!input.previous) return undefined;
  const board = at(input.previous.fen);
  return board && play(board, input.previous.uci);
}

function isRecapture(input: WhyInput, best: Move): boolean {
  const previous = previousMove(input);
  return (
    best.captured !== undefined &&
    previous?.captured !== undefined &&
    previous.to === best.to
  );
}

function bestMove(input: WhyInput) {
  const board = at(input.fen);
  const uci = input.bestLine[0];
  if (!board || uci === undefined) return undefined;
  const best = play(board, uci);
  return best ? { best, after: board } : undefined;
}

// Other moves that take back on the same square.
function otherRecaptureMoves(input: WhyInput, best: Move): readonly Move[] {
  if (!isRecapture(input, best)) return [];
  return new Chess(input.fen)
    .moves({ verbose: true })
    .filter((move) => move.to === best.to && move.lan !== best.lan);
}

function gameMove(input: WhyInput): Move | undefined {
  if (
    input.gameMoveUci === undefined ||
    input.gameMoveUci === input.bestLine[0]
  )
    return undefined;
  const board = at(input.fen);
  return board && play(board, input.gameMoveUci);
}

// The positions to ask Stockfish about before a packet can be built.
export function whySearches(input: WhyInput): readonly WhySearch[] {
  const found = bestMove(input);
  if (!found) return [];
  const { best, after } = found;
  const searches: WhySearch[] = [];
  const skip = !after.inCheck() && !after.isGameOver() && passed(best.after);
  if (skip) searches.push({ key: "threat", fen: skip, multiPv: 1 });
  if (!after.isGameOver())
    searches.push({ key: "defences", fen: best.after, multiPv: 3 });
  for (const move of otherRecaptureMoves(input, best))
    if (!new Chess(move.after).isGameOver())
      searches.push({
        key: `recapture:${move.lan}`,
        fen: move.after,
        multiPv: 1,
      });
  const game = gameMove(input);
  if (game && !new Chess(game.after).isGameOver())
    searches.push({ key: "game", fen: game.after, multiPv: 1 });
  return searches;
}

// The piece pinning the piece on `square` to its king, if any.
function pinner(board: Chess, square: Square): string | null {
  const piece = board.get(square);
  if (!piece) return null;
  const [king] = board.findPiece({ type: "k", color: piece.color });
  if (!king) return null;
  const df = fileOf(square) - fileOf(king);
  const dr = rankOf(square) - rankOf(king);
  const straight = df === 0 || dr === 0;
  if (!straight && Math.abs(df) !== Math.abs(dr)) return null;
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  for (let i = 1; ; i++) {
    const next = squareAt(fileOf(square) + sf * i, rankOf(square) + sr * i);
    if (!next) return null;
    const there = board.get(next);
    if (!there) continue;
    if (there.color === piece.color) return null;
    return (straight ? "rq" : "bq").includes(there.type)
      ? label(board, next)
      : null;
  }
}

// Enemy squares the piece on `from` attacks in `board`.
function targets(board: Chess, from: Square, them: Color): Square[] {
  const us = opponent(them);
  return board
    .board()
    .flat()
    .flatMap((piece) =>
      piece?.color === them && board.attackers(piece.square, us).includes(from)
        ? [piece.square]
        : [],
    );
}

export function whyPacket(
  input: WhyInput,
  lines: WhyLines,
): WhyPacket | undefined {
  const found = bestMove(input);
  const before = at(input.fen);
  if (!found || !before) return undefined;
  const { best, after } = found;
  const us = before.turn();
  const them = opponent(us);
  const top = (key: string) => lines.get(key)?.[0];

  // Worth naming: a king, or a piece that is undefended or worth more than
  // the piece attacking it.
  const worth = (square: Square, by: Move["piece"]) => {
    const piece = after.get(square);
    if (!piece) return false;
    return (
      piece.type === "k" ||
      (piece.type !== "p" &&
        (after.attackers(square, them).length === 0 ||
          PIECE_VALUE[piece.type] > PIECE_VALUE[by]))
    );
  };
  const named = (square: Square) => {
    const piece = after.get(square);
    return piece?.type === "k" ? `king on ${square}` : label(after, square);
  };

  let threat: WhyPacket["threatAfterBestMove"] = null;
  const skip =
    !after.inCheck() && !after.isGameOver() ? passed(best.after) : undefined;
  const threatLine = top("threat");
  if (skip && threatLine) {
    const read = readLine(skip, threatLine, us, 3);
    const [first] = read?.san ?? [];
    if (
      read &&
      first &&
      (read.mate || read.points - balance(after, us) >= THREAT_POINTS)
    )
      threat = { move: first, line: read.steps, endsWith: read.endsWith };
  }

  const defences = (lines.get("defences") ?? []).flatMap((line) => {
    const read = readLine(input.fen, [best.lan, ...line], us, 7);
    const [, defence] = read?.san ?? [];
    return read && defence
      ? [{ defence, line: read.steps.slice(1), endsWith: read.endsWith }]
      : [];
  });

  const recapture = isRecapture(input, best);
  const capture: WhyPacket["bestMoveCaptures"] =
    best.captured === undefined
      ? null
      : {
          takes: `the ${PIECE_NAME[best.captured]} on ${best.to}`,
          isRecapture: recapture,
          canTakeBack: after
            .moves({ verbose: true })
            .filter((move) => move.to === best.to)
            .map((move) => `${PIECE_NAME[move.piece]} on ${move.from}`),
          attackersThatArePinned: after
            .attackers(best.to, them)
            .filter(
              (square) =>
                !after
                  .moves({ square, verbose: true })
                  .some((move) => move.to === best.to),
            )
            .map((square) => ({
              piece: label(after, square),
              pinnedBy: pinner(after, square),
            })),
        };

  const otherRecaptures = otherRecaptureMoves(input, best).flatMap((move) => {
    const read = readLine(
      input.fen,
      [move.lan, ...(top(`recapture:${move.lan}`) ?? [])],
      us,
      5,
    );
    return read
      ? [{ move: move.san, line: read.steps, endsWith: read.endsWith }]
      : [];
  });

  // Pieces of ours that did not move but newly attack something worth it.
  const opensLines = after
    .board()
    .flat()
    .flatMap((piece) =>
      piece?.color === us &&
      piece.square !== best.to &&
      "rbq".includes(piece.type)
        ? [piece]
        : [],
    )
    .flatMap((piece) => {
      const earlier = new Set(
        before.get(piece.square)?.type === piece.type
          ? targets(before, piece.square, them).filter((square) =>
              after.get(square),
            )
          : [],
      );
      return targets(after, piece.square, them)
        .filter((square) => !earlier.has(square) && worth(square, piece.type))
        .map((square) => ({
          piece: label(after, piece.square),
          attacks: named(square),
        }));
    });

  const hit = targets(after, best.to, them);
  const attacks = hit
    .filter((square) => worth(square, best.piece))
    .map((square) =>
      after.get(square)?.type === "k"
        ? { target: named(square) }
        : {
            target: named(square),
            defended: after.attackers(square, them).length > 0,
          },
    );
  // For a sliding piece, what stands behind the first piece it hits: a
  // skewer or a pin.
  const linesUp: { front: string; behind: string }[] = [];
  if ("rbq".includes(best.piece))
    for (const square of hit) {
      const sf = Math.sign(fileOf(square) - fileOf(best.to));
      const sr = Math.sign(rankOf(square) - rankOf(best.to));
      for (let i = 1; ; i++) {
        const next = squareAt(fileOf(square) + sf * i, rankOf(square) + sr * i);
        if (!next) break;
        const piece = after.get(next);
        if (!piece) continue;
        if (piece.color === them && piece.type !== "p")
          linesUp.push({ front: named(square), behind: named(next) });
        break;
      }
    }

  const game = gameMove(input);
  const gameRead = game
    ? readLine(input.fen, [game.lan, ...(top("game") ?? [])], us, 5)
    : undefined;
  const previous = previousMove(input);
  const bestRead = readLine(input.fen, input.bestLine, us, 7);
  if (!bestRead) return undefined;

  return {
    fen: input.fen,
    youAre: SIDE[us],
    materialNow: standing(balance(before, us)),
    previousMove: previous
      ? `${SIDE[previous.color]} ${previous.san}${previous.captured ? `, taking the ${PIECE_NAME[previous.captured]} on ${previous.to}` : ""}`
      : null,
    bestMove: best.san,
    bestMoveGivesCheck: after.inCheck(),
    bestMoveCaptures: capture,
    bestMoveOpensLines: opensLines,
    bestMoveAttacks: attacks,
    bestMoveLinesUp: linesUp,
    threatAfterBestMove: threat,
    bestLine: shown(bestRead),
    opponentDefences: defences,
    otherRecaptures,
    yourGameMove:
      game && gameRead
        ? { move: game.san, line: gameRead.steps, endsWith: gameRead.endsWith }
        : null,
  };
}
