import { cachedReflection } from "../../domain/material/reflection";
import { z } from "zod";
import {
  useStudyNavigation,
  returnToParent,
  useEntryState,
} from "../../shared/navigation/history-entry";
import { useLayoutEffect, useMemo, useRef } from "react";
import { buildGameReplay } from "../../domain/analysis/replay-game";
import { tutorGameMode, type GameRecord } from "../../domain/game/types";
import type { StudyAI } from "../../infrastructure/ai/study-gemini";
import { PositionChat } from "./PositionChat";

function sourceLabel(game: GameRecord) {
  if (game.origin.type !== "tutor") return "Imported game";
  return tutorGameMode(game) === "rated" ? "Rated game" : "Coached game";
}

function positionsFromGame(game: GameRecord) {
  const replay = buildGameReplay(game);
  if (!replay.ok) return [];
  const side = game.playerColor === "black" ? "b" : "w";
  return replay.frames.flatMap((frame, index) => {
    const [, turn, , , , number] = frame.fen.split(" ");
    const next = replay.frames[index + 1];
    if (turn !== side || !next?.lastMoveSan) return [];
    const notation =
      String(number) + (turn === "b" ? "... " : ". ") + next.lastMoveSan;
    const continuation = replay.frames
      .slice(index + 1, index + 5)
      .flatMap(({ lastMoveSan }) => (lastMoveSan ? [lastMoveSan] : []));
    return [
      {
        title: "Before " + notation,
        fen: frame.fen,
        insight: "You played " + next.lastMoveSan + ".",
        question: cachedReflection("calculation"),
        continuation,
      },
    ];
  });
}

export function PersonalGameStudy({
  games,
  ai,
  onLibrary,
}: {
  games: readonly GameRecord[];
  ai: StudyAI | null;
  onLibrary: () => void;
}) {
  const enterStudy = useStudyNavigation();
  const content = useRef<HTMLElement>(null);
  const [chosenGame, setChosenGame] = useEntryState(
    "personal.game",
    z.string().optional(),
    undefined,
  );
  const [chosenFen, setChosenFen] = useEntryState(
    "personal.fen",
    z.string().optional(),
    undefined,
  );
  const [practice, setPractice] = useEntryState(
    "personal.open",
    z.boolean(),
    false,
  );
  const game = games.find(({ id }) => id === chosenGame) ?? games[0];
  const positions = useMemo(
    () => (game ? positionsFromGame(game) : []),
    [game],
  );
  const position =
    positions.find(({ fen }) => fen === chosenFen) ?? positions.at(-1);
  useLayoutEffect(() => {
    if (location.hash !== "#skill-tree") {
      content.current?.scrollIntoView({ block: "start" });
    }
  }, [practice]);
  if (practice && position && game?.playerColor)
    return (
      <PositionChat
        ai={ai}
        lesson={position}
        question={position.question}
        orientation={game.playerColor}
        backLabel="Back to your games"
        onBack={() => {
          returnToParent(() => {
            setPractice(false);
          });
        }}
      />
    );
  if (!game?.playerColor) return null;
  const side = game.playerColor;
  return (
    <section
      ref={content}
      className="skill-challenges personal-challenges"
      aria-label="Lessons and position practice"
    >
      {position ? (
        <ul className="skill-challenge-list">
          <li>
            <div>
              <h3>{position.title}</h3>
              <p>
                {sourceLabel(game)} · {side === "black" ? "Black" : "White"} to
                play
              </p>
            </div>
            <button
              className="primary-link"
              onClick={() => {
                enterStudy("personal-position");
                setChosenFen(position.fen);
                setChosenGame(game.id);
                setPractice(true);
              }}
            >
              Play this position
            </button>
          </li>
        </ul>
      ) : (
        <p role="status">
          This game could not be replayed. Choose another game.
        </p>
      )}
      <div className="personal-position-picker">
        <label>
          Choose a game
          <select
            value={game.id}
            onChange={(event) => {
              setChosenGame(event.currentTarget.value);
              setChosenFen(undefined);
            }}
          >
            {games.map((item, index) => (
              <option key={item.id} value={item.id}>
                {sourceLabel(item)} {games.length - index} ·{" "}
                {item.playerColor === "black" ? "Black" : "White"} ·{" "}
                {item.origin.type === "pgn-upload"
                  ? item.origin.sourceName
                  : item.completedAt?.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        {position && (
          <label>
            Choose a move
            <select
              value={position.fen}
              onChange={(event) => {
                setChosenFen(event.currentTarget.value);
              }}
            >
              {positions.map((item) => (
                <option key={item.fen} value={item.fen}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="review-action" onClick={onLibrary}>
          Find a historical game
        </button>
      </div>
    </section>
  );
}
