// The QuestionRouter port (ENGINEERING.md §17.3 rules 2 and 8). A model only
// names the intent of a typed question; code decides what Rook does. Any
// on-device model can sit behind it.
export const questionIntents = [
  "why",
  "what-if",
  "show",
  "hint",
  "threats",
  "reflect",
  "other",
] as const;

export type QuestionIntent = (typeof questionIntents)[number];

export interface QuestionContext {
  readonly text: string;
  readonly fen: string;
  readonly learnerPlayed?: string | undefined;
  readonly legalMoves: readonly string[];
}

export interface QuestionRouter {
  // The name shown in "… understood", such as "Gemini Flash".
  readonly model: string;
  // undefined when the model is unavailable, fails or returns invalid output.
  route(
    context: QuestionContext,
    signal: AbortSignal,
  ): Promise<QuestionIntent | undefined>;
}
