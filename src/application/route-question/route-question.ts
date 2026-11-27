import { Chess } from "chess.js";

import { writtenMove } from "../../domain/game/exploration-intent";
import type { ChipAction } from "../../domain/session/types";
import type { QuestionIntent, QuestionRouter } from "./question-router";

// What Rook does with a typed question (design §3.2 and §3.4). Online, a
// routed question acts at once. Offline, Rook first asks "Did you mean …?".
export type QuestionOutcome =
  | {
      readonly kind: "act";
      readonly action: RoutedAction;
      readonly understood: string;
    }
  | {
      // Offline: Rook asks "Did you mean: {label}" beside "Something else".
      readonly kind: "confirm";
      readonly action: RoutedAction;
      readonly label: string;
      readonly understood: string;
    }
  | { readonly kind: "play-it-on-the-board"; readonly understood: string }
  | { readonly kind: "unrouted" };

// The chip actions plus Show me, which a typed "just show me" can ask for.
export type RoutedAction = ChipAction | { readonly kind: "show-me" };

const describe: Record<RoutedAction["kind"], (san?: string) => string> = {
  threats: () => "What are you threatening?",
  checks: () => "Any checks for me?",
  scan: () => "Scan for me",
  why: (san) => `Why ${san ?? "this move"}?`,
  "what-if": (san) => `What if ${san ?? "this move"}?`,
  "show-line": () => "Show the whole line",
  plan: () => "What's the plan?",
  "something-else": () => "Something else",
  done: () => "Done",
  "show-me": () => "Show me the idea",
};

function sanOf(fen: string, uci: string): string | undefined {
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    }).san;
  } catch {
    return undefined;
  }
}

export function routedLabel(
  action: RoutedAction,
  fen: string,
  boardMove?: { readonly uci: string; readonly san: string },
): string {
  return describe[action.kind](
    "uci" in action ? moveName(fen, action.uci, boardMove) : undefined,
  );
}

// A move on the board that was already played, such as one in a line the
// learner is stepping through, is not legal in the shown position, so its
// name comes with it.
function moveName(
  fen: string,
  uci: string,
  boardMove: { readonly uci: string; readonly san: string } | undefined,
): string | undefined {
  return (
    sanOf(fen, uci) ?? (boardMove?.uci === uci ? boardMove.san : undefined)
  );
}

// Moves come from written notation in the question or the move selected on
// the board, never from a model reading words.
function actionFor(
  intent: QuestionIntent,
  text: string,
  fen: string,
  boardMoveUci: string | undefined,
): RoutedAction | "needs-move" {
  switch (intent) {
    case "why":
    case "what-if": {
      const uci = writtenMove(text, fen)?.lan ?? boardMoveUci;
      return uci === undefined ? "needs-move" : { kind: intent, uci };
    }
    case "show":
      return { kind: "show-me" };
    case "hint":
      return { kind: "scan" };
    case "threats":
      return { kind: "threats" };
    case "reflect":
    case "other":
      return { kind: "something-else" };
  }
}

export async function routeQuestion({
  text,
  fen,
  learnerPlayed,
  boardMoveUci,
  boardMoveSan,
  online,
  cloud,
  device,
  signal,
}: {
  readonly text: string;
  readonly fen: string;
  readonly learnerPlayed?: string | undefined;
  readonly boardMoveUci?: string | undefined;
  readonly boardMoveSan?: string | undefined;
  readonly online: boolean;
  readonly cloud: QuestionRouter | undefined;
  readonly device: QuestionRouter | undefined;
  readonly signal: AbortSignal;
}): Promise<QuestionOutcome> {
  let legalMoves: readonly string[];
  try {
    legalMoves = new Chess(fen).moves();
  } catch {
    return { kind: "unrouted" };
  }
  const context = { text, fen, learnerPlayed, legalMoves };
  const viaCloud = online && cloud !== undefined;
  const router = viaCloud ? cloud : device;
  if (!router) return { kind: "unrouted" };
  let intent = await router.route(context, signal);
  let model = router.model;
  // Online but the cloud failed: fall back to the device model, offline style.
  let confirm = !viaCloud;
  if (intent === undefined && viaCloud && device) {
    intent = await device.route(context, signal);
    model = device.model;
    confirm = true;
  }
  if (intent === undefined) return { kind: "unrouted" };
  const action = actionFor(intent, text, fen, boardMoveUci);
  if (action === "needs-move")
    return {
      kind: "play-it-on-the-board",
      understood: `${model} understood · ${intent}`,
    };
  const boardMove =
    boardMoveUci === undefined || boardMoveSan === undefined
      ? undefined
      : { uci: boardMoveUci, san: boardMoveSan };
  const label = routedLabel(action, fen, boardMove);
  const understood = `${model} understood · ${intent}${"uci" in action ? ` · ${moveName(fen, action.uci, boardMove) ?? action.uci}` : ""}`;
  if (!confirm) return { kind: "act", action, understood };
  return { kind: "confirm", action, label, understood };
}
