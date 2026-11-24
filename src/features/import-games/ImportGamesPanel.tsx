import { useState, type SyntheticEvent } from "react";

import type {
  ImportGamesResult,
  PgnImportSource,
} from "../../domain/import/types";
import type { PlayerColor } from "../../domain/game/types";
import "./import-games.css";

export interface ImportGamesRequest {
  readonly text: string;
  readonly source: PgnImportSource;
  readonly playerColor: PlayerColor;
}

export interface ImportGamesPanelProps {
  readonly onImport: (
    request: ImportGamesRequest,
  ) => Promise<ImportGamesResult>;
}

type ImportViewState =
  | { readonly status: "idle" }
  | { readonly status: "reading-file"; readonly fileName: string }
  | { readonly status: "importing" }
  | { readonly status: "complete"; readonly result: ImportGamesResult }
  | { readonly status: "failed"; readonly message: string };

function sourceLabel(source: PgnImportSource): string {
  return source.type === "paste" ? "Pasted PGN" : source.fileName;
}

export function ImportGamesPanel({ onImport }: ImportGamesPanelProps) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<PgnImportSource>({ type: "paste" });
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [view, setView] = useState<ImportViewState>({ status: "idle" });

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
    setView({ status: "importing" });
    try {
      if (playerColor === null) return;
      const result = await onImport({ text, source, playerColor });
      setView({ status: "complete", result });
    } catch {
      setView({
        status: "failed",
        message:
          "The import stopped unexpectedly. Your existing games were not changed.",
      });
    }
  }

  function reset(): void {
    setText("");
    setSource({ type: "paste" });
    setView({ status: "idle" });
  }

  const busy = view.status === "reading-file" || view.status === "importing";

  return (
    <section className="import-panel" aria-labelledby="import-games-title">
      <div className="import-panel__intro">
        <p className="import-panel__eyebrow">Bring your games</p>
        <h2 id="import-games-title">Import completed PGNs</h2>
        <p>
          Accepted games reveal recurring weaknesses and shape future lessons.
          Their ratings and results never directly change your tutor opponent
          level.
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

        <div className="import-panel__actions">
          <button
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
      {view.status === "complete" ? (
        <div className="import-panel__result" aria-live="polite">
          <h3>
            {view.result.acceptedCount} accepted, {view.result.duplicateCount}{" "}
            duplicate, {view.result.rejectedCount} rejected
          </h3>
          <ul>
            {view.result.items.map((item) => (
              <li
                key={`${String(item.index)}-${item.status}`}
                data-status={item.status}
              >
                <strong>Game {String(item.index + 1)}</strong>{" "}
                {item.status === "accepted"
                  ? `Accepted as ${item.game.record.playerColor === "white" ? "White" : "Black"}. It will influence weakness evidence and lesson focus after analysis.`
                  : item.issue.message}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="import-panel__secondary"
            onClick={reset}
          >
            Import more games
          </button>
        </div>
      ) : null}
    </section>
  );
}
