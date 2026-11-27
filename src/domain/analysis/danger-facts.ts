import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

import {
  PIECE_NAME,
  opponent,
  piecesOf,
  staticExchange,
} from "./board-relations";

// Checked facts for "Spot the danger": in the position the player faces, which
// of their pieces the opponent attacks, whether taking one wins material, and
// whether the opponent threatens mate in one. These are the tap targets, the
// arrows, and the closed list an on-device model may choose from when it reads
// the player's own words. Pure: chess.js only.

export const DANGER_FACTS_VERSION = "danger-facts/1";

export type DangerKind = "wins-material" | "attacked-but-safe" | "mate-threat";

export interface DangerFact {
  // Stable within one position, for example "wins-material:e6".
  readonly id: string;
  readonly kind: DangerKind;
  readonly target: Square;
  readonly piece: PieceSymbol;
  readonly attackers: readonly Square[];
  // Points the opponent gains by starting the exchange; 0 when safe.
  readonly gain: number;
  readonly text: string;
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const attackerNames = (board: Chess, squares: readonly Square[]) =>
  squares
    .map((square) => {
      const type = board.get(square)?.type;
      return `the ${type ? PIECE_NAME[type] : "piece"} on ${square}`;
    })
    .join(" and ");

function mateThreats(board: Chess, player: Color): DangerFact[] {
  if (board.inCheck()) return [];
  const fields = board.fen().split(" ");
  fields[1] = opponent(player);
  fields[3] = "-";
  let flipped: Chess;
  try {
    flipped = new Chess(fields.join(" "));
  } catch {
    return [];
  }
  const [king] = board.findPiece({ type: "k", color: player });
  if (!king) return [];
  return flipped
    .moves({ verbose: true })
    .filter((move) => {
      const next = new Chess(flipped.fen());
      next.move(move.san);
      return next.isCheckmate();
    })
    .map((move) => ({
      id: `mate-threat:${move.from}${move.to}`,
      kind: "mate-threat" as const,
      target: king,
      piece: "k" as const,
      attackers: [move.from],
      gain: 0,
      text: sentence(
        `${attackerNames(board, [move.from])} threatens mate with ${move.san}.`,
      ),
    }));
}

// Facts for the side to move in `fen`, most serious first: mate threats, then
// pieces the opponent wins by largest gain, then attacked pieces that are safe.
export function dangerFacts(fen: string): readonly DangerFact[] | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const player = board.turn();
  const them = opponent(player);
  const attacked = piecesOf(board, player)
    .filter(({ type }) => type !== "k")
    .flatMap(({ square, type }) => {
      const attackers = board.attackers(square, them);
      if (attackers.length === 0) return [];
      const gain = Math.max(0, staticExchange(board, square, them));
      const kind: DangerKind = gain > 0 ? "wins-material" : "attacked-but-safe";
      const defended = board.attackers(square, player).length > 0;
      const text =
        gain > 0
          ? `${attackerNames(board, attackers)} can win your ${PIECE_NAME[type]} on ${square}${defended ? "" : ", which has no defender"}.`
          : `${attackerNames(board, attackers)} attacks your ${PIECE_NAME[type]} on ${square}, but taking it wins nothing.`;
      return [
        {
          id: `${kind}:${square}`,
          kind,
          target: square,
          piece: type,
          attackers,
          gain,
          text: sentence(text),
        },
      ];
    });
  const order = {
    "mate-threat": 0,
    "wins-material": 1,
    "attacked-but-safe": 2,
  };
  return [...mateThreats(board, player), ...attacked].toSorted(
    (a, b) => order[a.kind] - order[b.kind] || b.gain - a.gain,
  );
}
