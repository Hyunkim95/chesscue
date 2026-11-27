import { LoadingState } from "../shared/loading/LoadingState";
import { useEffect, useEffectEvent, useState } from "react";
import type { GameRecord, PlayerColor } from "../domain/game/types";
import { fetchCompletedGame } from "./lichess-export";
import { ChessComArchiveMiss, fetchChessComGame } from "./chess-com-export";
import type { CompletedGameExport, GameSite } from "./external-game";

import { PGN_SHARING_NOTICE } from "../domain/import/sharing";

interface Props {
  route: string;
  site: GameSite;
  importGame: (
    game: CompletedGameExport,
    color: PlayerColor,
    site: GameSite,
  ) => Promise<GameRecord>;
  review: (record: GameRecord) => void;
  manual: () => void;
}
type State =
  | { status: "loading" }
  | {
      status: "choose";
      game: CompletedGameExport;
      suggested: PlayerColor | undefined;
    }
  | { status: "saving" }
  | { status: "error"; message: string; hasOlder: boolean };

export function ExternalGameImport({
  route,
  site,
  importGame,
  review,
  manual,
}: Props) {
  const siteName = site === "chesscom" ? "Chess.com" : "Lichess";
  const [archiveBatch, searchOlder] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, retry] = useState(0);
  const [choice, setChoice] = useState<{
    game: CompletedGameExport;
    color: PlayerColor;
  } | null>(null);
  const save = useEffectEvent(importGame);
  const open = useEffectEvent(review);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [, id, player] = route.split("/");
      const game =
        choice?.game ??
        (site === "chesscom"
          ? await fetchChessComGame(route, archiveBatch, controller.signal)
          : await fetchCompletedGame(id ?? "", controller.signal));
      if (controller.signal.aborted) return;
      if (!choice) {
        const color = (["white", "black"] as const).find(
          (side) =>
            site === "lichess" &&
            player &&
            game.players[side].user?.id.toLowerCase() === player.toLowerCase(),
        );
        setState({ status: "choose", game, suggested: color });
        return;
      }
      setState({ status: "saving" });
      const record = await save(game, choice.color, site);
      controller.signal.throwIfAborted();
      open(record);
    }
    void load().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setState({
          status: "error",
          hasOlder: cause instanceof ChessComArchiveMiss && cause.hasOlder,
          message:
            cause instanceof Error
              ? cause.message
              : "The game could not be imported.",
        });
    });
    return () => {
      controller.abort();
    };
  }, [route, site, attempt, choice, archiveBatch]);
  return (
    <section className="import-panel" aria-label={siteName + " game"}>
      <h1>
        {state.status === "choose"
          ? state.suggested
            ? "Share this game for review?"
            : "Which side did you play?"
          : "Practise this game"}
      </h1>
      {state.status === "loading" && (
        <LoadingState>Checking the {siteName} result…</LoadingState>
      )}
      {state.status === "saving" && (
        <LoadingState>Opening your review…</LoadingState>
      )}
      {state.status === "choose" && (
        <div className="import-panel__actions">
          <p>{PGN_SHARING_NOTICE}</p>
          {site === "chesscom" && <p>ChessCue is independent of Chess.com.</p>}
          {(state.suggested
            ? [state.suggested]
            : (["white", "black"] as const)
          ).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                setChoice({ game: state.game, color });
              }}
            >
              {state.suggested
                ? "Share game and review"
                : (color === "white" ? "White" : "Black") +
                  " · " +
                  (state.game.players[color].user?.name ?? "Anonymous")}
            </button>
          ))}
        </div>
      )}
      {state.status === "error" && (
        <>
          <p role="alert">{state.message}</p>
          <div className="import-panel__actions">
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                setChoice(null);
                retry((n) => n + 1);
              }}
            >
              Try again
            </button>
            {state.hasOlder && (
              <button
                type="button"
                onClick={() => {
                  setState({ status: "loading" });
                  searchOlder((batch) => batch + 1);
                }}
              >
                Search older archives
              </button>
            )}
            <button type="button" onClick={manual}>
              Import PGN
            </button>
          </div>
        </>
      )}
    </section>
  );
}
