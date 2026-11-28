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

// Spot the danger: what the player says they see, and the checked facts
// about the position it may match. The model never sees anything else.
export interface DangerContext {
  readonly text: string;
  readonly facts: readonly { readonly id: string; readonly text: string }[];
}

// A hint that fits the player's answer: the hints code built, each with the
// sentence the model reads to decide. The model never sees anything else.
export interface HintContext {
  readonly text: string;
  readonly options: readonly {
    readonly id: string;
    readonly whenToChoose: string;
  }[];
}

export interface VoiceContext {
  readonly text: string;
  readonly caption: string;
  readonly boardCanMove: boolean;
  readonly controls: readonly { readonly id: string; readonly label: string }[];
  readonly moves: readonly {
    readonly id: string;
    readonly san: string;
    readonly uci: string;
  }[];
}

// What a danger reading names: one of the supplied fact ids, or none.
export const NO_DANGER = "none";

export interface QuestionRouter {
  // The name shown in "… understood", such as "Gemini Flash".
  readonly model: string;
  // undefined when the model is unavailable, fails or returns invalid output.
  route(
    context: QuestionContext,
    signal: AbortSignal,
  ): Promise<QuestionIntent | undefined>;
  // One supplied fact id or NO_DANGER, never free text. undefined when the
  // model is unavailable, fails or returns anything else.
  readDanger(
    context: DangerContext,
    signal: AbortSignal,
  ): Promise<string | undefined>;
  // One supplied hint id, never free text. undefined when the model is
  // unavailable, fails or returns anything else.
  pickHint(
    context: HintContext,
    signal: AbortSignal,
  ): Promise<string | undefined>;
  // One currently available control or legal move id. "none" leaves the
  // utterance with Rook's normal question handling.
  routeVoice?(
    context: VoiceContext,
    signal: AbortSignal,
  ): Promise<string | undefined>;
}
