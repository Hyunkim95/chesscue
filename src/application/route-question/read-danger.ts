import type { DangerFact } from "../../domain/analysis/danger-facts";
import { dangerLabel } from "../../domain/session/spot-danger";
import { NO_DANGER, type QuestionRouter } from "./question-router";

// Spot the danger (PRD §5.8): the on-device model matches what the player
// says they see to one checked danger fact, and code writes Rook's line from
// it. Feedback only: a reading never counts as evidence.
export type DangerReading =
  | {
      readonly kind: "read";
      // The matched fact, or undefined when the words match none of them.
      readonly factId: string | undefined;
      readonly understood: string;
    }
  | { readonly kind: "unrouted" };

export async function readDanger({
  text,
  facts,
  router,
  signal,
}: {
  readonly text: string;
  readonly facts: readonly DangerFact[];
  readonly router: QuestionRouter | undefined;
  readonly signal: AbortSignal;
}): Promise<DangerReading> {
  if (!router || facts.length === 0) return { kind: "unrouted" };
  const id = await router.readDanger(
    { text, facts: facts.map((fact) => ({ id: fact.id, text: fact.text })) },
    signal,
  );
  if (id === undefined || signal.aborted) return { kind: "unrouted" };
  // The adapter validates too; an id that is not one of the facts is a
  // failed reading, not a guess.
  const fact = facts.find((entry) => entry.id === id);
  if (!fact && id !== NO_DANGER) return { kind: "unrouted" };
  return {
    kind: "read",
    factId: fact?.id,
    understood: `${router.model} understood · ${dangerLabel(fact)}`,
  };
}
