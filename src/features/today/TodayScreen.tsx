import type { WeekDay } from "../../domain/progress/types";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Ring } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
import "./today.css";

export type TodayState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "position";
      readonly fen: string;
      // "Your game vs Ahmed · Tuesday"
      readonly sourceLabel: string;
      readonly returning: boolean;
      // What the player is working towards, such as "One move here wins material."
      readonly prompt: string;
    }
  | { readonly kind: "warm-up"; readonly fen: string; readonly prompt: string }
  | { readonly kind: "caught-up" };

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
}: {
  readonly state: TodayState;
  readonly goal: { readonly done: number; readonly target: number };
  readonly week: readonly WeekDay[];
  readonly onPlay: () => void;
  readonly onImport: () => void;
  readonly onPlayGame: () => void;
  readonly onSky: () => void;
}) {
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
        <button type="button" className="today__link" onClick={onSky}>
          ✦ Look at your sky
        </button>
      </div>
    );

  const warmUp = state.kind === "warm-up";
  const turn = state.fen.split(" ")[1] === "b" ? "Black" : "White";
  return (
    <div className="today">
      <section className="today__card" aria-labelledby="today-title">
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
      <RookSays>
        <RookCharacter mood="idle" />
        <RookBubble tone="muted">
          {warmUp
            ? "Bring me one of your games and I'll find the moments worth a second look."
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
            <button type="button" className="today__link" onClick={onPlayGame}>
              Play a game
            </button>
          </div>
        </>
      ) : (
        <Button wide onClick={onPlay}>
          Play it
        </Button>
      )}
      {goalRow}
    </div>
  );
}
