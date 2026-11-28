import { Chess } from "chess.js";

import type { WeekDay } from "../../domain/progress/types";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Ring } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
import { pieceSymbols } from "../board/board-pieces";
import "./today.css";

export type TodayState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "position";
      readonly fen: string;
      // "Your game vs Ahmed · Tuesday"
      readonly sourceLabel: string;
      readonly returning: boolean;
      // A position from the player's own games, or a library puzzle with an
      // idea they missed.
      readonly origin: "game" | "puzzle";
      // What the player is working towards, such as "One move here wins material."
      readonly prompt: string;
    }
  | { readonly kind: "warm-up"; readonly fen: string; readonly prompt: string }
  | { readonly kind: "caught-up" };

// A recommended puzzle under Today's position. Never named by its idea.
export interface TodayPuzzle {
  readonly id: string;
  readonly fen: string;
  readonly rating: number;
}

const turnOf = (fen: string) => (fen.split(" ")[1] === "b" ? "Black" : "White");

// A still picture of the position, the side to move at the bottom. The
// button carries its name, so the squares are hidden from screen readers.
function MiniBoard({ fen }: { readonly fen: string }) {
  let rows: ReturnType<Chess["board"]>;
  try {
    rows = new Chess(fen).board();
  } catch {
    return null;
  }
  const flipped = turnOf(fen) === "Black";
  const ordered = flipped
    ? rows.toReversed().map((row) => row.toReversed())
    : rows;
  return (
    <span className="today-puzzle__board" aria-hidden="true">
      {ordered.flatMap((row, r) =>
        row.map((piece, f) => (
          <span
            key={`${String(r)}${String(f)}`}
            className={`today-puzzle__square${(r + f) % 2 ? " today-puzzle__square--dark" : ""}`}
          >
            {piece && (
              <span
                className={`today-puzzle__piece${piece.color === "w" ? " today-puzzle__piece--white" : ""}`}
              >
                {pieceSymbols.b[piece.type]}
              </span>
            )}
          </span>
        )),
      )}
    </span>
  );
}

// "Puzzles for you" (owner approval, 28 November 2026): up to three
// thumbnails under the main action, each opening its puzzle.
function PuzzleStrip({
  puzzles,
  onOpen,
}: {
  readonly puzzles: readonly TodayPuzzle[];
  readonly onOpen: (id: string) => void;
}) {
  if (puzzles.length === 0) return null;
  return (
    <section className="today-puzzles" aria-labelledby="today-puzzles-title">
      <h2 id="today-puzzles-title" className="today__eyebrow">
        Puzzles for you
      </h2>
      <ul className="today-puzzles__list">
        {puzzles.map((puzzle) => (
          <li key={puzzle.id}>
            <button
              type="button"
              className="today-puzzle"
              aria-label={`Puzzle rated ${String(puzzle.rating)}, ${turnOf(puzzle.fen)} to move`}
              onClick={() => {
                onOpen(puzzle.id);
              }}
            >
              <MiniBoard fen={puzzle.fen} />
              <span className="today-puzzle__rating" aria-hidden="true">
                {puzzle.rating}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const WEEKDAY = new Intl.DateTimeFormat("en", {
  weekday: "narrow",
  timeZone: "UTC",
});

export function TodayScreen({
  state,
  goal,
  week,
  onPlay,
  onImport,
  onPlayGame,
  onSky,
  puzzles = [],
  onOpenPuzzle,
}: {
  readonly state: TodayState;
  readonly goal: { readonly done: number; readonly target: number };
  readonly week: readonly WeekDay[];
  readonly onPlay: () => void;
  readonly onImport: () => void;
  readonly onPlayGame: () => void;
  readonly onSky: () => void;
  // Recommended puzzles under the main action.
  readonly puzzles?: readonly TodayPuzzle[];
  readonly onOpenPuzzle?: (id: string) => void;
}) {
  const strip = onOpenPuzzle ? (
    <PuzzleStrip puzzles={puzzles} onOpen={onOpenPuzzle} />
  ) : null;
  const left = Math.max(goal.target - goal.done, 0);
  const goalRow = (
    <div className="today__goal">
      <Ring
        done={goal.done}
        target={goal.target}
        size="sm"
        label={`${String(Math.min(goal.done, goal.target))} of ${String(goal.target)} positions today`}
      />
      <span>
        <b>Daily goal</b> ·{" "}
        {left === 0 ? "done for today" : `${String(left)} to go`}
      </span>
      <span className="today__week" aria-label="This week">
        {week.map((day, index) => (
          <i
            key={day.date}
            title={day.date}
            className={`${day.done ? "today__day--done" : ""}${index === week.length - 1 ? " today__day--today" : ""}`}
            aria-label={`${WEEKDAY.format(new Date(day.date))} ${day.done ? "done" : "not yet"}`}
          />
        ))}
      </span>
    </div>
  );

  if (state.kind === "loading")
    return (
      <div className="today" aria-busy="true">
        <div className="today__card today__card--skeleton" />
        <RookSays>
          <RookCharacter mood="think" />
          <RookBubble tone="muted">
            Finding a moment from your games…
          </RookBubble>
        </RookSays>
      </div>
    );

  if (state.kind === "caught-up")
    return (
      <div className="today today--caught-up">
        <RookCharacter mood="happy" size="lg" />
        <h1 className="today__title">All caught up ✨</h1>
        <Ring
          done={goal.target}
          target={goal.target}
          size="lg"
          label="Daily goal done"
        />
        <p className="today__note">New moments come from new games.</p>
        <Button wide onClick={onPlayGame}>
          Play a game
        </Button>
        {strip}
        <button type="button" className="today__link" onClick={onSky}>
          ✦ Look at your sky
        </button>
      </div>
    );

  const warmUp = state.kind === "warm-up";
  const turn = turnOf(state.fen);
  return (
    <div className="today board-split">
      <section
        className="today__card board-split__main"
        aria-labelledby="today-title"
      >
        <header className="today__head">
          <h1 id="today-title" className="today__eyebrow">
            {warmUp ? "Warm-up position" : "Today's position"}
          </h1>
          <span className="today__source">
            {warmUp ? "A classic to start with" : state.sourceLabel}
          </span>
        </header>
        <ChessBoard
          fen={state.fen}
          label={`${turn} to move`}
          orientation={turn === "White" ? "white" : "black"}
        />
        <footer className="today__foot">
          <span className="today__turn">{turn} to move</span>
          <span className="today__question">{state.prompt}</span>
        </footer>
      </section>
      <div className="board-split__aside">
        <RookSays>
          <RookCharacter mood="idle" />
          <RookBubble tone="muted">
            {warmUp
              ? "Bring me one of your games and I'll find the moments worth a second look."
              : state.origin === "puzzle"
                ? "Same idea as one you missed. Have a go."
                : state.returning
                  ? "This one came back. Have another look."
                  : "This one's from your game. I think you'll like it."}
          </RookBubble>
        </RookSays>
        {warmUp ? (
          <>
            <Button wide onClick={onImport}>
              Import my games
            </Button>
            <div className="today__links">
              <button type="button" className="today__link" onClick={onPlay}>
                Try the warm-up
              </button>
              <button
                type="button"
                className="today__link"
                onClick={onPlayGame}
              >
                Play a game
              </button>
            </div>
          </>
        ) : (
          <Button wide onClick={onPlay}>
            Play it
          </Button>
        )}
        {strip}
        {goalRow}
      </div>
    </div>
  );
}
