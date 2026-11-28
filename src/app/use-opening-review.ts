import { Chess } from "chess.js";
import { useEffect, useState } from "react";

import type { MoveAnalysisFact } from "../domain/analysis/types";
import type { GameRecord } from "../domain/game/types";
import { positionKey } from "../domain/openings/opening-book";
import {
  openingReview,
  type MoveEvaluation,
  type OpeningReview,
} from "../domain/openings/opening-review";
import { loadOpeningBook } from "../infrastructure/openings/opening-book-asset";

export type OpeningReviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "none" }
  | { readonly kind: "ready"; readonly review: OpeningReview };

const START = positionKey(new Chess().fen());

// Stockfish's checks of the player's moves, keyed by ply, for comparing the
// move that left the book with the book move.
export function moveEvaluations(
  facts: readonly MoveAnalysisFact[],
): ReadonlyMap<number, MoveEvaluation> {
  return new Map(
    facts.map((fact) => [
      fact.ply,
      { playedCp: fact.evaluationAfterCp, candidates: fact.candidates },
    ]),
  );
}

// The opening review for a finished game from the standard start. Games from
// another start position, or without a player colour, have none.
export function useOpeningReview(
  game: GameRecord | null | undefined,
  evaluations?: ReadonlyMap<number, MoveEvaluation>,
): OpeningReviewState {
  const [state, setState] = useState<{
    readonly key: string;
    readonly value: OpeningReviewState;
  }>();
  const key = game ? `${game.id}:${String(evaluations?.size ?? 0)}` : "";
  const playerColor =
    game?.playerColor === "white"
      ? "w"
      : game?.playerColor === "black"
        ? "b"
        : undefined;
  const eligible =
    game !== null &&
    game !== undefined &&
    playerColor !== undefined &&
    positionKey(game.initialFen) === START;
  useEffect(() => {
    if (!game || !eligible) return;
    let live = true;
    void loadOpeningBook().then((book) => {
      if (!live) return;
      const review = book
        ? openingReview({
            book,
            moves: game.moves.map(({ uci }) => uci),
            playerColor,
            ...(evaluations ? { evaluations } : {}),
          })
        : undefined;
      setState({
        key,
        value:
          review?.ok && review.value
            ? { kind: "ready", review: review.value }
            : { kind: "none" },
      });
    });
    return () => {
      live = false;
    };
  }, [game, eligible, playerColor, evaluations, key]);
  if (game && !eligible) return { kind: "none" };
  // While Stockfish's scores arrive, the review without them stays shown.
  return state !== undefined && game && state.key.startsWith(`${game.id}:`)
    ? state.value
    : { kind: "loading" };
}
