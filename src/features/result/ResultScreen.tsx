import { useState, type ReactNode } from "react";

import type { StoryFrame } from "../../domain/analysis/line-storyboard";
import { ranks } from "../../domain/game/rank-path";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Pill } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
import { departureBadges } from "../board/departure-badges";
import type { FinalPosition, ResultOutcome } from "./final-position";
import "./result-screen.css";

// A rated game's Elo change. While it loads, the headline shows the result
// alone; there is no spinner.
export type ResultRating =
  | { readonly kind: "unrated" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "rated"; readonly before: number; readonly after: number };

// The positions Rook found in this game, from the game's own analysis.
export type ResultMoments =
  | { readonly kind: "reading" }
  | { readonly kind: "failed" }
  | { readonly kind: "found"; readonly count: number };

// The game's opening: its name, where it left the book, and board frames for
// the departure, the player's opening slips and the opening's ideas.
export interface ResultOpening {
  readonly name: string;
  readonly summary: string;
  readonly frames: readonly StoryFrame[];
}

const OUTCOME: Record<ResultOutcome, string> = {
  won: "You won",
  lost: "You lost",
  draw: "Draw",
};

// The part after the result: the Elo change, or a quiet unrated label.
function headlineDetail(rating: ResultRating): string | undefined {
  if (rating.kind === "unrated") return "Coached game, unrated";
  if (rating.kind !== "rated") return undefined;
  const delta = rating.after - rating.before;
  return `${delta < 0 ? "-" : "+"}${String(Math.abs(delta))} Elo`;
}

function rankLine(elo: number): string {
  const next = ranks.find(({ floor }) => floor > elo);
  if (!next)
    return `${ranks[ranks.length - 1]?.name ?? "Top"} rank · ${String(elo)}`;
  return `${next.name} at ${String(next.floor)} · ${String(next.floor - elo)} to go`;
}

export function ResultScreen({
  position,
  rating,
  moments,
  share,
  opening,
  onLookAtMoments,
  onPlayAgain,
  onRetryRating,
}: {
  readonly position: FinalPosition;
  readonly rating: ResultRating;
  readonly moments: ResultMoments;
  // The existing Share this win disclosure, only for wins.
  readonly share?: ReactNode;
  readonly opening?: ResultOpening | undefined;
  readonly onLookAtMoments: () => void;
  readonly onPlayAgain: () => void;
  readonly onRetryRating: () => void;
}) {
  const found = moments.kind === "found" ? moments.count : 0;
  const detail = headlineDetail(rating);
  // The opening frame on the board, or undefined for the final position.
  const [step, setStep] = useState<number>();
  const frames = opening?.frames ?? [];
  const frame = step === undefined ? undefined : frames[step];
  return (
    <div className="result">
      <section className="result__card" aria-labelledby="result-title">
        <ChessBoard
          fen={frame?.fen ?? position.fen}
          label={
            frame && step !== undefined
              ? `Opening, step ${String(step + 1)} of ${String(frames.length)}`
              : "Final position"
          }
          orientation={position.orientation}
          lastMoveUci={frame ? frame.moveUci : position.lastMoveUci}
          animateMove={false}
          extraArrows={frame?.arrows ?? []}
          outlines={frame?.outlines ?? []}
          badges={departureBadges(frame?.arrows ?? [])}
          controlChanges={
            frame && frame.control.length > 0
              ? new Map(
                  frame.control.map(({ square, change }) => [square, change]),
                )
              : undefined
          }
        />
        <header className="result__head">
          <h1 id="result-title" className="result__title">
            {OUTCOME[position.outcome]}
            {detail !== undefined && (
              <span
                className={`result__detail${rating.kind === "unrated" ? " result__detail--quiet" : ""}`}
              >
                {` · ${detail}`}
              </span>
            )}
          </h1>
          {rating.kind === "rated" && (
            <p className="result__rank">{rankLine(rating.after)}</p>
          )}
          {rating.kind === "failed" && (
            <p className="result__rank" role="status">
              Rating unavailable
              <Pill onClick={onRetryRating}>Try again</Pill>
            </p>
          )}
        </header>
        {opening && frames.length > 0 && frame === undefined && (
          <button
            type="button"
            className="result__opening"
            onClick={() => {
              setStep(0);
            }}
          >
            <span className="result__opening-text">
              <span className="result__opening-label">Opening</span>
              <span className="result__opening-name">{opening.name}</span>
              <span className="result__opening-summary">{opening.summary}</span>
            </span>
            <span className="result__opening-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )}
      </section>
      {frame && step !== undefined ? (
        <>
          <RookSays>
            <RookCharacter mood="warm" />
            <RookBubble>{frame.caption}</RookBubble>
          </RookSays>
          <div className="result__steps">
            <Pill
              onClick={() => {
                setStep(step - 1);
              }}
              disabled={step === 0}
              aria-label="Back"
            >
              ‹
            </Pill>
            <span className="result__step-count">
              {step + 1} of {frames.length}
            </span>
            <Pill
              onClick={() => {
                setStep(step + 1);
              }}
              disabled={step === frames.length - 1}
              aria-label="Next"
            >
              ›
            </Pill>
            <Pill
              onClick={() => {
                setStep(undefined);
              }}
            >
              ↺ Reset
            </Pill>
          </div>
        </>
      ) : (
        <RookSays>
          <RookCharacter
            mood={
              moments.kind === "reading"
                ? "think"
                : moments.kind === "failed"
                  ? "hmm"
                  : "happy"
            }
          />
          {found > 0 ? (
            // A caption about Rook rather than his line: he speaks in the first
            // person (design §6), so this sits beside him without a bubble.
            <h2 className="result__found" aria-live="polite">
              Rook found {found} {found === 1 ? "moment" : "moments"} in this
              game
            </h2>
          ) : (
            <RookBubble tone={moments.kind === "found" ? "default" : "muted"}>
              {moments.kind === "reading"
                ? "Reading your game…"
                : moments.kind === "failed"
                  ? "I couldn't read this game. Your next game will show its moments."
                  : "No missed moments in this game. Nice."}
            </RookBubble>
          )}
        </RookSays>
      )}
      <div className="result__actions">
        {found > 0 && (
          <Button wide onClick={onLookAtMoments}>
            {found === 1 ? "Look at it" : "Look at them"}
          </Button>
        )}
        <Button
          wide
          variant={found > 0 ? "ghost" : "primary"}
          onClick={onPlayAgain}
        >
          Play again
        </Button>
      </div>
      {share !== undefined && position.outcome === "won" && (
        <div className="result__share">{share}</div>
      )}
    </div>
  );
}
