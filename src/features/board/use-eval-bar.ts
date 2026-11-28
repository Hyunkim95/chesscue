import { Chess } from "chess.js";
import { useEffect, useState } from "react";

import type { AssessPosition } from "../../application/analyze-game/assess-position";
import { terminalAssessment } from "../../domain/game/board-balance";
import {
  CHECKING,
  barReading,
  type BarReading,
} from "../../domain/game/eval-bar";

// Readings already made, so stepping back and forth through a line is
// instant. Small and bounded: the oldest reading goes first.
const known = new Map<string, BarReading>();
const LIMIT = 300;

function remember(fen: string, reading: BarReading) {
  known.set(fen, reading);
  if (known.size > LIMIT) {
    const [oldest] = known.keys();
    if (oldest !== undefined) known.delete(oldest);
  }
}

// A reading already known: read before, or a finished game (mate or draw),
// which needs no engine. Cached, so the same position keeps one reading.
function knownReading(fen: string): BarReading | undefined {
  const cached = known.get(fen);
  if (cached) return cached;
  let assessment;
  try {
    assessment = terminalAssessment(new Chess(fen));
  } catch {
    return undefined;
  }
  if (!assessment) return undefined;
  const reading = barReading(assessment);
  remember(fen, reading);
  return reading;
}

// The bar for the board's position. Undefined hides the bar (no engine, or
// the screen does not show it yet). While Stockfish checks a new position the
// bar keeps its last reading, so it moves once instead of jumping to even.
export function useEvalBar(
  fen: string | undefined,
  assess: AssessPosition | undefined,
): BarReading | undefined {
  const [last, setLast] = useState<BarReading>(CHECKING);
  const ready = fen === undefined ? undefined : knownReading(fen);
  // A position read before becomes the reading to hold for the next one.
  if (ready !== undefined && ready !== last) setLast(ready);
  useEffect(() => {
    if (fen === undefined || assess === undefined || ready !== undefined)
      return;
    const controller = new AbortController();
    void assess(fen, controller.signal)
      .catch(() => null)
      .then((assessment) => {
        if (controller.signal.aborted || assessment === null) return;
        const reading = barReading(assessment);
        remember(fen, reading);
        setLast(reading);
      });
    return () => {
      controller.abort();
    };
  }, [assess, fen, ready]);
  if (assess === undefined || fen === undefined) return undefined;
  return ready ?? last;
}
