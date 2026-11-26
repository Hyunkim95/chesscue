import { useEffect, useEffectEvent, useState } from "react";
import type { GameRecord, PlayerColor } from "../domain/game/types";
import { fetchCompletedGame, type LichessExport } from "./lichess-export";

import { PGN_SHARING_NOTICE } from "../domain/import/sharing";

interface Props {
  route: string;
  importGame: (game: LichessExport, color: PlayerColor) => Promise<GameRecord>;
  review: (record: GameRecord) => void;
  manual: () => void;
}
type State =
  | { status: "loading" }
  | {
      status: "choose";
      game: LichessExport;
      suggested: PlayerColor | undefined;
    }
  | { status: "saving" }
  | { status: "error"; message: string };

export function LichessImport({ route, importGame, review, manual }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, retry] = useState(0);
  const [choice, setChoice] = useState<{
    game: LichessExport;
    color: PlayerColor;
  } | null>(null);
  const save = useEffectEvent(importGame);
  const open = useEffectEvent(review);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [, id, player] = route.split("/");
      const game =
        choice?.game ?? (await fetchCompletedGame(id ?? "", controller.signal));
      if (controller.signal.aborted) return;
      if (!choice) {
        const color = (["white", "black"] as const).find(
          (side) =>
            player &&
            game.players[side].user?.id.toLowerCase() === player.toLowerCase(),
        );
        setState({ status: "choose", game, suggested: color });
        return;
      }
      setState({ status: "saving" });
      const record = await save(game, choice.color);
      controller.signal.throwIfAborted();
      open(record);
    }
    void load().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setState({
          status: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "The game could not be imported.",
        });
    });
    return () => {
      controller.abort();
    };
  }, [route, attempt, choice]);
  return (
    <section className="import-panel" aria-label="Lichess game">
      <h1>
        {state.status === "choose"
          ? state.suggested
            ? "Share this game for review?"
            : "Which side did you play?"
          : "Practise this game"}
      </h1>
      {state.status === "loading" && (
        <p role="status">Checking the Lichess result…</p>
      )}
      {state.status === "saving" && <p role="status">Opening your review…</p>}
      {state.status === "choose" && (
        <div className="import-panel__actions">
          <p>{PGN_SHARING_NOTICE}</p>
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
            <button type="button" onClick={manual}>
              Import PGN
            </button>
          </div>
        </>
      )}
    </section>
  );
}
