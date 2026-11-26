import { EmptyState } from "../../shared/empty-state/EmptyState";
import type { SnapshotState } from "../../app/use-playing-snapshot";
import type { VerifiedGameDrill } from "../../domain/curriculum/game-drill";
import type { MovePattern } from "../../domain/curriculum/playing-snapshot";
import { tutorGameMode, type GameRecord } from "../../domain/game/types";

function MoveEvidence({
  pattern,
  games,
  onReplay,
}: {
  pattern: MovePattern;
  games: readonly GameRecord[];
  onReplay: (drill: VerifiedGameDrill) => void;
}) {
  const gameNumbers = new Map(games.map((game, i) => [game.id, i + 1]));
  function row(item: MovePattern["moves"][number]) {
    const { game, drill } = item;
    const move =
      drill.moveLabel.replace("Move ", "") +
      (game.playerColor === "black" ? "... " : ". ") +
      drill.played;
    const mode = drill.imported
      ? "Imported"
      : tutorGameMode(game) === "rated"
        ? "Rated"
        : "Coached";
    return (
      <li key={game.id + "/" + String(item.ply)}>
        <span>
          Game {gameNumbers.get(game.id)} · {mode} ·{" "}
          {game.playerColor === "black" ? "Black" : "White"} ·{" "}
          <time dateTime={drill.completedAt}>
            {new Date(drill.completedAt).toLocaleDateString()}
          </time>
        </span>
        <button
          className="review-action"
          onClick={() => {
            onReplay(drill);
          }}
        >
          Replay {move}
        </button>
        <span>
          {item.outcome === "retry"
            ? "Stockfish preferred " + drill.candidate
            : "Within Stockfish’s accepted range"}
        </span>
      </li>
    );
  }
  return (
    <>
      <ul className="snapshot-evidence">
        {pattern.moves.slice(0, 2).map(row)}
      </ul>
      {pattern.moves.length > 2 && (
        <details>
          <summary>Show {pattern.moves.length - 2} more moves</summary>
          <ul className="snapshot-evidence">
            {pattern.moves.slice(2).map(row)}
          </ul>
        </details>
      )}
    </>
  );
}
export function TrainingAnalysisStatus({
  state,
  onPlay,
  onImport,
}: {
  state: SnapshotState;
  onPlay: () => void;
  onImport: () => void;
}) {
  if (state.status === "checking")
    return <p role="status">Reading your completed games…</p>;
  if (state.status === "failed") return <p role="alert">{state.message}</p>;
  if (state.games.length === 0)
    return (
      <div className="training-empty">
        <EmptyState
          art="practice"
          title="Practice from your games"
          description="Play or import a completed game to get your first recommendation."
        >
          <button type="button" className="primary-link" onClick={onPlay}>
            Play a game
          </button>
          <button type="button" className="review-action" onClick={onImport}>
            Import games
          </button>
        </EmptyState>
      </div>
    );
  return (
    <p className="training-analysis-status" role="status">
      {state.checked} of {state.games.length} completed{" "}
      {state.games.length === 1 ? "game" : "games"} analyzed.
      {state.checked + state.failed < state.total
        ? " Checking more positions…"
        : ""}
      {state.failed > 0 ? " Some analyses are unavailable." : ""}
      {state.total === 0 ? " Your games ended before you made a move." : ""}
      {state.total > 0 &&
      state.checked + state.failed === state.total &&
      !state.plan.practice.length
        ? " No verified practice target yet."
        : ""}
    </p>
  );
}
export function SkillMoveEvidence({
  practice,
  strengths,
  games,
  onReplay,
}: {
  practice: readonly MovePattern[];
  strengths: readonly MovePattern[];
  games: readonly GameRecord[];
  onReplay: (drill: VerifiedGameDrill) => void;
}) {
  if (!practice.length && !strengths.length) return null;
  return (
    <section className="skill-move-evidence" aria-label="Moves from your games">
      <h3>Moves from your games</h3>
      {practice.map((pattern) => {
        const later =
          strengths
            .find((s) => s.key === pattern.key)
            ?.moves.filter((good) =>
              pattern.moves.some(
                (miss) => miss.game.id === good.game.id && miss.ply < good.ply,
              ),
            ) ?? [];
        const recovered = new Set(later.map((m) => m.game.id)).size;
        return (
          <details key={pattern.key}>
            <summary>
              {pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1)} ·{" "}
              {pattern.moves.length}{" "}
              {pattern.moves.length === 1 ? "move" : "moves"}{" "}
              {pattern.games === 1
                ? "in one game"
                : "across " + String(pattern.games) + " games"}
            </summary>
            {pattern.key === "back-rank" && recovered > 0 && (
              <p>
                You found a back-rank mate later in{" "}
                {recovered === 1
                  ? "one of these games"
                  : String(recovered) + " of these games"}
                . Try spotting it at the earlier opportunity.
              </p>
            )}
            <MoveEvidence pattern={pattern} games={games} onReplay={onReplay} />
          </details>
        );
      })}
      {strengths.map((pattern) => (
        <details key={"strength-" + pattern.key}>
          <summary>What you did well · {pattern.name}</summary>
          <p>
            Your choice matched a checked candidate in {pattern.games}{" "}
            {pattern.games === 1 ? "game" : "games"}.
          </p>
          <MoveEvidence pattern={pattern} games={games} onReplay={onReplay} />
        </details>
      ))}
    </section>
  );
}
