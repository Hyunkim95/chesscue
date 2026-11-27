// The symbols label training themes. Selection and recommendations have their own cues.
const symbols: Readonly<Record<string, string>> = {
  "read-the-board": "◉",
  "get-out-of-check": "♚",
  "count-captures": "⇄",
  "see-the-threat": "♞",
  "simple-mates": "♛",
  "develop-with-purpose": "♘",
  "mating-patterns": "♛",
  "double-attack": "♞",
  "line-tactics": "♝",
  "open-attack-line": "♜",
  "passed-pawn-race": "♟",
  "calculate-replies": "⇄",
  "change-the-defender": "♝",
  "test-a-sacrifice": "♞",
  "pawn-ending": "♟",
  "choose-trades": "⇄",
  "activate-a-piece": "♘",
  "pawn-breaks": "♟",
  "king-attack-plan": "♚",
  "rook-ending": "♜",
  "opening-structure": "♙",
};

export function skillSymbol(unitId: string): string {
  return symbols[unitId] ?? "◇";
}
