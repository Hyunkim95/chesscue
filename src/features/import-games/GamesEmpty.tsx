import type { ReactNode } from "react";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Pill } from "../../shared/ui/primitives";
import "./games-states.css";

export type GameSource = "lichess" | "chess-com" | "pgn";

const SOURCES: readonly {
  readonly source: GameSource;
  readonly label: string;
}[] = [
  { source: "lichess", label: "Lichess" },
  { source: "chess-com", label: "Chess.com" },
  { source: "pgn", label: "PGN" },
];

// The Games tab before any game is imported (design §3.7). Renders inside the
// tabs shell body.
export function GamesEmpty({
  onImport,
  onAdd,
}: {
  // The one primary action: the full import flow.
  readonly onImport: () => void;
  readonly onAdd: (source: GameSource) => void;
}) {
  return (
    <div className="games-state games-empty">
      <h1 className="games-state__title">Your games</h1>
      <GamesEmptyIntro
        action={
          <Button wide onClick={onImport}>
            Import my games
          </Button>
        }
      />
      <GameImportSources onAdd={onAdd} />
    </div>
  );
}

export function GamesEmptyIntro({ action }: { readonly action?: ReactNode }) {
  return (
    <div className="games-empty__hero">
      <RookSays>
        <RookCharacter mood="idle" />
        <RookBubble>
          Bring me <b>one of your games</b> and I&apos;ll find the moments worth
          a second look.
        </RookBubble>
      </RookSays>
      {action}
    </div>
  );
}

export function GameImportSources({
  onAdd,
}: {
  readonly onAdd: (source: GameSource) => void;
}) {
  return (
    <div
      className="games-import-sources"
      role="group"
      aria-label="Import games"
    >
      {SOURCES.map(({ source, label }) => (
        <Pill
          key={source}
          aria-label={source === "pgn" ? "Import PGN" : `Import from ${label}`}
          onClick={() => {
            onAdd(source);
          }}
        >
          <span aria-hidden="true">+ </span>
          {label}
        </Pill>
      ))}
    </div>
  );
}
