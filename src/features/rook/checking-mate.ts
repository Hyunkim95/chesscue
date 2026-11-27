import type { Chess, Color } from "chess.js";

// An attacker needs one winning move. Every legal defender reply must lose.
// Restricting the attack to checks can miss a mate, but cannot prove a false one.
export async function checkingMate(
  board: Chess,
  attacker: Color,
  signal: AbortSignal,
  expiresAt: number,
): Promise<{ first: string; within: number } | null> {
  let nodes = 0;
  let lastYield = performance.now();
  const stopped = () =>
    signal.aborted || performance.now() >= expiresAt || nodes >= 1400;

  async function visit(plies: number): Promise<string | null> {
    if (stopped()) return null;
    nodes++;
    if (performance.now() - lastYield >= 10) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
      if (stopped()) return null;
    }
    if (board.isCheckmate()) return board.turn() !== attacker ? "#" : null;
    if (plies === 0 || board.isDraw()) return null;
    const attacking = board.turn() === attacker;
    const moves = board.moves();
    for (const san of moves) {
      if (stopped()) return null;
      if (attacking && !/[+#]$/.test(san)) continue;
      board.move(san);
      const result = await visit(plies - 1);
      board.undo();
      if (attacking && result) return san;
      if (!attacking && !result) return null;
    }
    return attacking ? null : "#";
  }
  for (const within of [1, 2, 3]) {
    const first = await visit(within * 2 - 1);
    if (first && !stopped()) return { first, within };
    if (stopped()) break;
  }
  return null;
}
