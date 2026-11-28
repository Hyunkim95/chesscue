import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";

import type { AssessPosition } from "../../application/analyze-game/assess-position";
import {
  terminalAssessment,
  type PositionAssessment,
} from "../../domain/game/board-balance";
import {
  CHECKING,
  barReading,
  type BarReading,
} from "../../domain/game/eval-bar";

// Positions already read, so stepping back and forth through a line is
// instant. Small and bounded: the oldest reading goes first.
const known = new Map<string, PositionAssessment>();
const LIMIT = 300;

function remember(fen: string, assessment: PositionAssessment) {
  known.set(fen, assessment);
  if (known.size > LIMIT) {
    const [oldest] = known.keys();
    if (oldest !== undefined) known.delete(oldest);
  }
}

// A reading already known: read before, or a finished game (mate or draw),
// which needs no engine. Cached, so the same position keeps one object.
function knownAssessment(fen: string): PositionAssessment | undefined {
  const cached = known.get(fen);
  if (cached) return cached;
  let assessment;
  try {
    assessment = terminalAssessment(new Chess(fen));
  } catch {
    return undefined;
  }
  if (!assessment) return undefined;
  remember(fen, assessment);
  return assessment;
}

export type AssessmentState =
  | { readonly kind: "ready"; readonly assessment: PositionAssessment }
  | { readonly kind: "checking" }
  | { readonly kind: "unavailable" };

// Stockfish's reading of the position on the board. `known` is a score the
// screen already has; `paused` holds off a search while the engine is busy
// elsewhere. `held` is the last reading made, kept while the next position is
// checked so a bar moves once instead of jumping to even.
export function usePositionAssessment(
  fen: string | undefined,
  assess: AssessPosition | undefined,
  {
    known: knownWhiteCp,
    paused = false,
  }: {
    readonly known?: number | undefined;
    readonly paused?: boolean;
  } = {},
): {
  readonly now: AssessmentState;
  readonly held: PositionAssessment | undefined;
} {
  const given = useMemo<PositionAssessment | undefined>(
    () =>
      knownWhiteCp === undefined
        ? undefined
        : { kind: "estimate", whiteCentipawns: knownWhiteCp },
    [knownWhiteCp],
  );
  const [held, setHeld] = useState<PositionAssessment>();
  const [failed, setFailed] = useState<string>();
  const ready = fen === undefined ? undefined : (given ?? knownAssessment(fen));
  // A position read before becomes the reading to hold for the next one.
  if (ready !== undefined && ready !== held) setHeld(ready);
  const search =
    fen !== undefined &&
    assess !== undefined &&
    !paused &&
    ready === undefined &&
    failed !== fen;
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    void assess(fen, controller.signal)
      .catch(() => null)
      .then((assessment) => {
        if (controller.signal.aborted) return;
        if (assessment === null) {
          setFailed(fen);
          return;
        }
        remember(fen, assessment);
        setHeld(assessment);
      });
    return () => {
      controller.abort();
    };
  }, [assess, fen, search]);
  const now: AssessmentState = ready
    ? { kind: "ready", assessment: ready }
    : search || paused
      ? { kind: "checking" }
      : { kind: "unavailable" };
  return { now, held };
}

// The bar for a board's position, or undefined to hide it (no engine, or
// the screen does not show it yet).
export function useEvalBar(
  fen: string | undefined,
  assess: AssessPosition | undefined,
): BarReading | undefined {
  const { now, held } = usePositionAssessment(fen, assess);
  return barFor(assess === undefined ? undefined : now, held);
}

// The bar for an assessment a screen already tracks.
export function barFor(
  now: AssessmentState | undefined,
  held: PositionAssessment | undefined,
): BarReading | undefined {
  if (now === undefined) return undefined;
  if (now.kind === "ready") return barReading(now.assessment);
  return held ? barReading(held) : CHECKING;
}
