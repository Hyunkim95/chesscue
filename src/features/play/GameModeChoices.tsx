import { useEffect, useState } from "react";

import { LoadingText } from "../../shared/loading/LoadingState";
import { findUnfinishedTutorGame } from "../../application/play-game/play-game";
import type { GameRepository } from "../../application/ports/game-repository";
import type { GameId, TutorGameMode } from "../../domain/game/types";

const modes = ["rated", "coached"] as const;

export function GameModeChoices({
  repository,
  activeMode,
  activeGameId,
  ready,
  onOpen,
  onNextMove,
}: {
  readonly repository: GameRepository;
  readonly activeMode: TutorGameMode;
  readonly activeGameId: GameId | undefined;
  readonly ready: boolean;
  readonly onOpen: (mode: TutorGameMode) => void;
  // The next-move tool: any position, outside every game.
  readonly onNextMove?: () => void;
}) {
  const [resumable, setResumable] = useState<readonly TutorGameMode[]>([]);

  useEffect(() => {
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void Promise.all(
        modes.map(async (mode) => {
          try {
            const game = await findUnfinishedTutorGame(
              repository,
              mode,
              activeMode === mode ? activeGameId : undefined,
            );
            return game.ok && game.value && game.value.moves.length > 0
              ? mode
              : null;
          } catch {
            return null;
          }
        }),
      ).then((games) => {
        if (request === revision)
          setResumable(games.filter((mode) => mode !== null));
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("chesscue-history", refresh);
    return () => {
      revision++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("chesscue-history", refresh);
    };
  }, [repository, activeMode, activeGameId]);

  return (
    <div className="game-mode-choices">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`game-mode-choice game-mode-choice--${mode}`}
          aria-labelledby={`mode-${mode}`}
          aria-describedby={`mode-${mode}-description`}
          disabled={!ready}
          onClick={() => {
            onOpen(mode);
          }}
        >
          <strong id={`mode-${mode}`}>
            {mode === "rated" ? "Rated" : "Coached"}
          </strong>
          <span className="game-mode-copy" id={`mode-${mode}-description`}>
            {mode === "rated"
              ? "Unassisted · Counts for Elo"
              : "Unrated · Rook can help"}
            {resumable.includes(mode) && (
              <span className="game-mode-resume">Resume</span>
            )}
          </span>
        </button>
      ))}
      {!ready && (
        <span role="status">
          <LoadingText>Preparing your game…</LoadingText>
        </span>
      )}
      {onNextMove && (
        <button
          type="button"
          className="game-mode-choice game-mode-choice--next-move"
          aria-labelledby="mode-next-move"
          aria-describedby="mode-next-move-description"
          onClick={onNextMove}
        >
          <strong id="mode-next-move">Next move</strong>
          <span className="game-mode-copy" id="mode-next-move-description">
            Any position · Stockfish&apos;s best move
          </span>
        </button>
      )}
    </div>
  );
}
