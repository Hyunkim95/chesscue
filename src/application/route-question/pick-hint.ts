import {
  hintOptions,
  type HintOption,
} from "../../domain/analysis/hint-options";
import type { QuestionRouter } from "./question-router";

// Hints that fit the player's answer (PRD §5.8): the on-device model picks
// one hint id from the list code built for the position; code writes every
// word and board mark. Without a valid pick there is no hint, and the screen
// keeps its fact-based nudge. Feedback only: never evidence.
export interface HintPick {
  readonly option: HintOption;
  // "Gemini Nano understood · …".
  readonly understood: string;
}

const LABEL: Readonly<Record<HintOption["id"], string>> = {
  "check-their-threats": "your own plan",
  "bigger-target": "a safe attack",
  scan: "nothing specific",
};

export async function pickHint({
  text,
  fen,
  router,
  signal,
}: {
  readonly text: string;
  readonly fen: string;
  readonly router: QuestionRouter | undefined;
  readonly signal: AbortSignal;
}): Promise<HintPick | undefined> {
  const options = hintOptions(fen);
  if (!options || !router) return undefined;
  const id = await router.pickHint(
    {
      text,
      options: options.map(({ id: option, whenToChoose }) => ({
        id: option,
        whenToChoose,
      })),
    },
    signal,
  );
  const option = options.find((entry) => entry.id === id);
  if (!option || signal.aborted) return undefined;
  return {
    option,
    understood: `${router.model} understood · ${LABEL[option.id]}`,
  };
}
