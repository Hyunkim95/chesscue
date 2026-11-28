import { LoadingText } from "../../shared/loading/LoadingState";
import { Chess, type Color, type PieceSymbol } from "chess.js";
import { useEffect, useId, useMemo, useState } from "react";

import type { AssessPosition } from "../../application/analyze-game/assess-position";
import {
  materialBalance,
  terminalAssessment,
  type BoardCapture,
  type PositionAssessment,
} from "../../domain/game/board-balance";
import { pieceNames, pieceSymbols } from "./board-pieces";
import "./board-balance.css";

interface PositionOptions {
  readonly assess: AssessPosition;
  readonly onDemand?: boolean;
  readonly available?: boolean;
  readonly knownWhiteCentipawns?: number | undefined;
}

export function BoardBalance({
  fen,
  captures,
  position,
}: {
  readonly fen: string;
  readonly captures: readonly BoardCapture[];
  readonly position?: PositionOptions | undefined;
}) {
  const material = useMemo(() => materialBalance(fen), [fen]);
  return (
    <div className="board-balance" role="group" aria-label="Board balance">
      <span className="board-balance__material">
        <span>Material</span>
        <MaterialSide
          color="w"
          captured={captures
            .filter(({ by }) => by === "w")
            .map(({ piece }) => piece)}
          score={material}
        />
        <MaterialSide
          color="b"
          captured={captures
            .filter(({ by }) => by === "b")
            .map(({ piece }) => piece)}
          score={-material}
        />
      </span>
      {position === undefined ? null : (
        <PositionReadout fen={fen} {...position} />
      )}
    </div>
  );
}

function MaterialSide({
  color,
  captured,
  score,
}: {
  readonly color: Color;
  readonly captured: readonly PieceSymbol[];
  readonly score: number;
}) {
  const label =
    score === 0 ? "0" : `${score > 0 ? "+" : "−"}${String(Math.abs(score))}`;
  return (
    <span className="board-balance__side">
      <span>{color === "w" ? "White" : "Black"}</span>
      {captured.length === 0 ? null : (
        <span
          className="board-balance__pieces"
          role="img"
          aria-label={`Captured ${captured.map((piece) => pieceNames[piece]).join(", ")}`}
        >
          {captured.map((piece, index) => (
            <span key={`${piece}-${String(index)}`} aria-hidden="true">
              {pieceSymbols[color === "w" ? "b" : "w"][piece]}
            </span>
          ))}
        </span>
      )}
      <strong
        className="board-balance__score"
        data-balance={score === 0 ? "even" : score > 0 ? "ahead" : "behind"}
      >
        {label}
      </strong>
    </span>
  );
}

function PositionReadout({
  fen,
  assess,
  onDemand = false,
  available = true,
  knownWhiteCentipawns,
}: PositionOptions & { readonly fen: string }) {
  const id = useId();
  const [requestedFen, setRequestedFen] = useState<string | null>(null);
  const [response, setResponse] = useState<{
    readonly fen: string;
    readonly assessment: PositionAssessment | null;
  } | null>(null);
  const terminal = useMemo(() => terminalAssessment(new Chess(fen)), [fen]);
  const open = available && (!onDemand || requestedFen === fen);
  const search =
    open &&
    terminal === null &&
    knownWhiteCentipawns === undefined &&
    response?.fen !== fen;
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    void assess(fen, controller.signal)
      .then((assessment) => {
        if (!controller.signal.aborted) setResponse({ fen, assessment });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse({ fen, assessment: null });
      });
    return () => {
      controller.abort();
    };
  }, [assess, fen, search]);
  const known =
    knownWhiteCentipawns === undefined
      ? null
      : {
          kind: "estimate" as const,
          whiteCentipawns: knownWhiteCentipawns,
        };
  const assessment =
    terminal ?? known ?? (response?.fen === fen ? response.assessment : null);
  return (
    <>
      {onDemand ? (
        <button
          className="board-balance__check"
          type="button"
          aria-expanded={open}
          aria-controls={id}
          disabled={!available}
          onClick={() => {
            if (!open && response?.assessment === null) setResponse(null);
            setRequestedFen(open ? null : fen);
          }}
        >
          {open ? "Hide position" : "Check position"}
        </button>
      ) : null}
      <span
        id={id}
        className="board-balance__entry"
        hidden={!open}
        aria-live="polite"
      >
        Position{" "}
        <strong>
          {search ? (
            <LoadingText>Checking…</LoadingText>
          ) : (
            positionLabel(assessment)
          )}
        </strong>
      </span>
    </>
  );
}

function positionLabel(assessment: PositionAssessment | null): string {
  if (assessment === null) return "Unavailable";
  if (assessment.kind === "draw") return "Draw";
  if (assessment.kind === "checkmate")
    return `${assessment.winner === "white" ? "White" : "Black"} wins by mate`;
  const score = assessment.whiteCentipawns;
  if (Math.abs(score) <= 35) return "About even";
  return score > 0 ? "White ahead" : "Black ahead";
}
