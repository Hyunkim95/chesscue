import { useState, type ReactNode } from "react";

import type { StoryFrame } from "../../domain/analysis/line-storyboard";
import type { GoodMove } from "../../domain/curriculum/good-moves";
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

// "3 things", "1 thing".
const things = (count: number) =>
  `${String(count)} ${count === 1 ? "thing" : "things"}`;

// What the board is stepping through: the opening, or one good move. Both are
// read only; replaying a good move records nothing.
type Story =
  | { readonly kind: "opening"; readonly step: number }
  | { readonly kind: "good"; readonly index: number; readonly step: number };

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
  goodMoves = [],
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
  // What the player did well, read from the same analysis as the moments.
  readonly goodMoves?: readonly GoodMove[] | undefined;
  readonly onLookAtMoments: () => void;
  readonly onPlayAgain: () => void;
  readonly onRetryRating: () => void;
}) {
  const found = moments.kind === "found" ? moments.count : 0;
  const good = moments.kind === "found" ? goodMoves : [];
  const detail = headlineDetail(rating);
  // The story frame on the board, or undefined for the final position.
  const [story, setStory] = useState<Story>();
  const openingFrames = opening?.frames ?? [];
  const shown = story?.kind === "good" ? good[story.index] : undefined;
  const frames = story?.kind === "good" ? (shown?.frames ?? []) : openingFrames;
  const step = story?.step;
  const frame = step === undefined ? undefined : frames[step];
  const next = story?.kind === "good" ? good[story.index + 1] : undefined;
  const goTo = (step: number) => {
    if (story) setStory({ ...story, step });
  };
  const openGood = () => {
    if (good.length > 0) setStory({ kind: "good", index: 0, step: 0 });
  };
  return (
    <div className="result">
      <section className="result__card" aria-labelledby="result-title">
        <ChessBoard
          fen={frame?.fen ?? position.fen}
          label={
            frame && step !== undefined
              ? story?.kind === "good"
                ? `Good move ${String(story.index + 1)} of ${String(good.length)}, step ${String(step + 1)} of ${String(frames.length)}`
                : `Opening, step ${String(step + 1)} of ${String(frames.length)}`
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
        {shown && frame && (
          <p className="result__good-label">
            {good.length > 1
              ? `Good move ${String((story?.kind === "good" ? story.index : 0) + 1)} of ${String(good.length)} · `
              : ""}
            {shown.moveLabel}, {shown.san}
          </p>
        )}
        {opening && openingFrames.length > 0 && frame === undefined && (
          <button
            type="button"
            className="result__opening"
            onClick={() => {
              setStory({ kind: "opening", step: 0 });
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
            <RookCharacter mood={story?.kind === "good" ? "happy" : "warm"} />
            <RookBubble>{frame.caption}</RookBubble>
          </RookSays>
          <div className="result__steps">
            <Pill
              onClick={() => {
                goTo(step - 1);
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
                goTo(step + 1);
              }}
              disabled={step === frames.length - 1}
              aria-label="Next"
            >
              ›
            </Pill>
            <Pill
              onClick={() => {
                // A good move's story starts on the position before it; the
                // opening's starts on the final position.
                if (story?.kind === "good") goTo(0);
                else setStory(undefined);
              }}
            >
              ↺ Reset
            </Pill>
          </div>
          {story?.kind === "good" && (
            <div className="result__steps result__steps--good">
              {next && (
                <Pill
                  onClick={() => {
                    setStory({ kind: "good", index: story.index + 1, step: 0 });
                  }}
                >
                  Next good move ›
                </Pill>
              )}
              <Pill
                onClick={() => {
                  setStory(undefined);
                }}
              >
                Done
              </Pill>
            </div>
          )}
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
            <div className="result__found-group">
              <h2 className="result__found" aria-live="polite">
                Rook found {found} {found === 1 ? "moment" : "moments"} in this
                game
              </h2>
              {good.length > 0 && (
                <button
                  type="button"
                  className="result__good"
                  onClick={openGood}
                >
                  · and {things(good.length)} you did well
                  <span className="result__good-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              )}
            </div>
          ) : good.length > 0 ? (
            <h2 className="result__found" aria-live="polite">
              Rook found {things(good.length)} you did well in this game
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
        {found === 0 && good.length > 0 && (
          <Button wide onClick={openGood}>
            {good.length === 1 ? "Look at it" : "Look at them"}
          </Button>
        )}
        <Button
          wide
          variant={found > 0 || good.length > 0 ? "ghost" : "primary"}
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
