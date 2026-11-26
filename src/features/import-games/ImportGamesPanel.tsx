import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";

import type {
  ImportGamesResult,
  PgnImportSource,
} from "../../domain/import/types";
import type { GameRecord, PlayerColor } from "../../domain/game/types";
import { PGN_SHARING_NOTICE } from "../../domain/import/sharing";
import "./import-games.css";

export interface ImportGamesRequest {
  readonly text: string;
  readonly source: PgnImportSource;
  readonly playerColor: PlayerColor;
}

export interface ImportedReview {
  readonly game: GameRecord;
  readonly perspective?: PlayerColor;
  readonly saved?: boolean;
}

export interface ImportGamesResponse extends ImportGamesResult {
  readonly savedGames: ReadonlyMap<number, GameRecord>;
}

export interface ImportGamesPanelProps {
  readonly onReview: (review: ImportedReview) => void;
  readonly onViewPlan: () => void;
  readonly onImport: (
    request: ImportGamesRequest,
  ) => Promise<ImportGamesResponse>;
}

type ImportViewState =
  | { readonly status: "idle" }
  | { readonly status: "reading-file"; readonly fileName: string }
  | { readonly status: "importing" }
  | { readonly status: "complete"; readonly result: ImportGamesResponse }
  | { readonly status: "failed"; readonly message: string };

function sourceLabel(source: PgnImportSource): string {
  return source.type === "paste" ? "Pasted PGN" : source.fileName;
}

export function ImportGamesPanel({
  onImport,
  onReview,
  onViewPlan,
}: ImportGamesPanelProps) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<PgnImportSource>({ type: "paste" });
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [view, setView] = useState<ImportViewState>({ status: "idle" });

  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resultHeading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (view.status === "complete") {
      document.documentElement.scrollTop = 0;
      resultHeading.current?.focus({ preventScroll: true });
    }
  }, [view.status]);

  async function handleFile(file: File | null): Promise<void> {
    if (file === null) return;
    setView({ status: "reading-file", fileName: file.name });
    try {
      const fileText = await file.text();
      setText(fileText);
      setSource({ type: "upload", fileName: file.name });
      setView({ status: "idle" });
    } catch {
      setView({
        status: "failed",
        message: "The PGN file could not be read. Choose it again.",
      });
    }
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (playerColor === null) return;
    setView({ status: "importing" });
    try {
      const result = await onImport({ text, source, playerColor });
      if (!mounted.current) return;
      const [item] = result.items;
      if (result.items.length === 1 && item?.status === "accepted") {
        onReview({ game: item.game.record });
        return;
      }
      if (result.items.length === 1 && item?.status === "duplicate") {
        const game = result.savedGames.get(item.index);
        if (game?.playerColor === playerColor) {
          onReview({ game, saved: true });
          return;
        }
      }
      setView({ status: "complete", result });
    } catch {
      setView({
        status: "failed",
        message:
          "Your PGN is still here. Try again to import any remaining games.",
      });
    }
  }

  function reset(): void {
    setText("");
    setSource({ type: "paste" });
    setView({ status: "idle" });
  }

  if (view.status === "complete") {
    const { acceptedCount, duplicateCount, rejectedCount } = view.result;
    const [firstItem] = view.result.items;
    const choosingPerspective =
      view.result.items.length === 1 &&
      firstItem?.status === "duplicate" &&
      view.result.savedGames.has(firstItem.index);
    return (
      <section className="import-panel" aria-labelledby="import-result-title">
        <div className="import-panel__intro">
          <p className="import-panel__eyebrow">Import result</p>
          <h1 id="import-result-title" tabIndex={-1} ref={resultHeading}>
            {choosingPerspective
              ? "This game is already saved"
              : acceptedCount > 0
                ? acceptedCount === 1
                  ? "Game added to your training plan"
                  : "Games added to your training plan"
                : "No new games added"}
          </h1>
          {!choosingPerspective && (
            <h2 className="import-panel__counts">
              {acceptedCount} accepted, {duplicateCount} duplicate,{" "}
              {rejectedCount} rejected
            </h2>
          )}
          {acceptedCount > 0 && (
            <p>
              Stockfish checks your moves for practice opportunities when you
              open Training plan.
            </p>
          )}
        </div>
        {!choosingPerspective && (
          <div className="import-panel__actions">
            {acceptedCount + duplicateCount > 0 && (
              <button
                type="button"
                className="primary-link"
                onClick={onViewPlan}
              >
                View your plan
              </button>
            )}
            {rejectedCount > 0 && (
              <button
                type="button"
                className="import-panel__secondary"
                onClick={() => {
                  setView({ status: "idle" });
                }}
              >
                Edit PGN
              </button>
            )}
            <button
              type="button"
              className="import-panel__secondary"
              onClick={reset}
            >
              Import more games
            </button>
          </div>
        )}
        <div className="import-panel__result">
          <ul>
            {view.result.items.map((item) => {
              const saved = view.result.savedGames.get(item.index);
              return (
                <li
                  key={`${String(item.index)}-${item.status}`}
                  data-status={item.status}
                >
                  <strong>Game {String(item.index + 1)}</strong>{" "}
                  {item.status === "accepted"
                    ? `Accepted as ${item.game.record.playerColor === "white" ? "White" : "Black"}.`
                    : item.issue.message}
                  {item.status === "duplicate" && saved && playerColor && (
                    <DuplicateReviewActions
                      game={saved}
                      requested={playerColor}
                      single={view.result.items.length === 1}
                      onReview={onReview}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }

  const busy = view.status === "reading-file" || view.status === "importing";

  return (
    <section className="import-panel" aria-labelledby="import-games-title">
      <div className="import-panel__intro">
        <p className="import-panel__eyebrow">Bring your games</p>
        <h2 id="import-games-title">Import completed PGNs</h2>
        <p>
          Import one game for an immediate review, or add a batch to your
          training plan. Your ChessCue Elo stays the same.
        </p>
      </div>

      <form
        className="import-panel__form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="import-panel__file">
          <span>Choose a PGN file</span>
          <input
            type="file"
            accept=".pgn,application/x-chess-pgn,text/plain"
            disabled={busy}
            onChange={(event) =>
              void handleFile(event.currentTarget.files?.item(0) ?? null)
            }
          />
        </label>

        <span className="import-panel__or" aria-hidden="true">
          or
        </span>

        <label>
          <span>Paste completed PGN games</span>
          <textarea
            rows={10}
            value={text}
            disabled={busy}
            placeholder={
              '[Event "Training game"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 ... 1-0'
            }
            onChange={(event) => {
              setText(event.currentTarget.value);
              setSource({ type: "paste" });
              if (view.status !== "idle") setView({ status: "idle" });
            }}
          />
        </label>

        <fieldset className="import-panel__color-choice">
          <legend>Which side did you play in these games?</legend>
          <div className="import-panel__color-options">
            <label>
              <input
                type="radio"
                name="player-color"
                value="white"
                required
                checked={playerColor === "white"}
                disabled={busy}
                onChange={() => {
                  setPlayerColor("white");
                }}
              />
              <span>I played White</span>
            </label>
            <label>
              <input
                type="radio"
                name="player-color"
                value="black"
                required
                checked={playerColor === "black"}
                disabled={busy}
                onChange={() => {
                  setPlayerColor("black");
                }}
              />
              <span>I played Black</span>
            </label>
          </div>
          <p>
            All games in this batch must use the same side. Import mixed-color
            games in separate batches.
          </p>
        </fieldset>

        <p id="pgn-sharing">{PGN_SHARING_NOTICE}</p>
        <div className="import-panel__actions">
          <button
            aria-describedby="pgn-sharing"
            type="submit"
            disabled={busy || text.trim().length === 0 || playerColor === null}
          >
            {view.status === "importing" ? "Checking games..." : "Import games"}
          </button>
          <span className="import-panel__source">
            Source: {sourceLabel(source)}
          </span>
        </div>
      </form>

      {view.status === "reading-file" ? (
        <p role="status">Reading {view.fileName}...</p>
      ) : null}
      {view.status === "failed" ? <p role="alert">{view.message}</p> : null}
    </section>
  );
}

function DuplicateReviewActions({
  game,
  requested,
  single,
  onReview,
}: {
  readonly game: GameRecord;
  readonly requested: PlayerColor;
  readonly single: boolean;
  readonly onReview: ImportGamesPanelProps["onReview"];
}) {
  if (game.playerColor === requested) {
    return (
      <button
        type="button"
        className="import-panel__secondary"
        onClick={() => {
          onReview({ game, saved: true });
        }}
      >
        Open review
      </button>
    );
  }
  const saved = game.playerColor === "white" ? "White" : "Black";
  const other = requested === "white" ? "White" : "Black";
  const choices = (
    <div className="import-panel__perspective">
      <p>Which side would you like to review?</p>
      <div className="import-panel__actions">
        <button
          type="button"
          className="import-panel__secondary"
          onClick={() => {
            onReview({ game, saved: true });
          }}
        >
          Open saved {saved} review
        </button>
        <button
          type="button"
          className="import-panel__secondary"
          onClick={() => {
            onReview({ game, perspective: requested });
          }}
        >
          Analyze {other} moves
        </button>
      </div>
    </div>
  );
  return single ? (
    choices
  ) : (
    <details>
      <summary>Open review</summary>
      {choices}
    </details>
  );
}
