// Frozen contract (ENGINEERING.md §17.2). Change it only through the lead
// agent, and update §17.2 in the same commit.

// How a tried move compares with the best move, from Stockfish's evaluation
// for the side to move (docs/design/board-first-redesign.md §3.2).
export type FeedbackTier = "best" | "missed" | "worse" | "costly";

export interface Attempt {
  readonly uci: string;
  readonly san: string;
  readonly tier: FeedbackTier;
  // Rook's answer from Stockfish, when the move was not the best one.
  readonly replyUci?: string;
}

export type MomentOutcome = "spotted" | "found-on-retry" | "shown";

export interface MomentResult {
  readonly outcome: MomentOutcome;
  // A hint, scan, preview or Show me was used before solving.
  readonly helped: boolean;
  // Distinct tries, previews and questions.
  readonly explorations: number;
  readonly attempts: readonly Attempt[];
}

export type SessionState =
  | { readonly kind: "before" }
  | { readonly kind: "tried"; readonly attempts: readonly Attempt[] }
  | { readonly kind: "second-miss"; readonly attempts: readonly Attempt[] }
  | {
      readonly kind: "solved";
      readonly firstTry: boolean;
      readonly attempts: readonly Attempt[];
    }
  | { readonly kind: "shown"; readonly attempts: readonly Attempt[] }
  | { readonly kind: "done"; readonly result: MomentResult };

export type SessionKind = SessionState["kind"];

// What tapping a chip does. Moves are UCI strings chosen by code from legal
// moves; a chip never carries the best move before the position is solved.
export type ChipAction =
  | { readonly kind: "threats" }
  | { readonly kind: "checks" }
  | { readonly kind: "scan" }
  | { readonly kind: "why"; readonly uci: string }
  | { readonly kind: "what-if"; readonly uci: string }
  | { readonly kind: "show-line" }
  | { readonly kind: "plan" }
  | { readonly kind: "something-else" }
  | { readonly kind: "done" };

export interface Chip {
  readonly id: string;
  readonly label: string;
  readonly action: ChipAction;
}
