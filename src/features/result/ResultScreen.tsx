import type { ReactNode } from "react";

import { ranks } from "../../domain/game/rank-path";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Pill } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
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
  onLookAtMoments,
  onPlayAgain,
  onRetryRating,
}: {
  readonly position: FinalPosition;
  readonly rating: ResultRating;
  readonly moments: ResultMoments;
  // The existing Share this win disclosure, only for wins.
  readonly share?: ReactNode;
  readonly onLookAtMoments: () => void;
  readonly onPlayAgain: () => void;
  readonly onRetryRating: () => void;
}) {
  const found = moments.kind === "found" ? moments.count : 0;
  const detail = headlineDetail(rating);
  return (
    <div className="result">
      <section className="result__card" aria-labelledby="result-title">
        <ChessBoard
          fen={position.fen}
          label="Final position"
          orientation={position.orientation}
          lastMoveUci={position.lastMoveUci}
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
      </section>
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
            Rook found {found} {found === 1 ? "moment" : "moments"} in this game
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
