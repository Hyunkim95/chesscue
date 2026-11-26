import { MIN_PLAYER_ELO, STOCKFISH_ELO_FLOOR } from "./beginner-opponent";
import { tutorGameMode, type GameId, type GameRecord } from "./types";

const LEGACY_INITIAL_ELO = 1450;
export const INITIAL_PLAYER_ELO = 1000;
export const PLACEMENT_GAMES = 5;

export const ratedOpponentElo = (elo: number): number =>
  Math.max(STOCKFISH_ELO_FLOOR, Math.min(3190, Math.round(elo)));

export interface RatingEntry {
  readonly gameId: GameId;
  readonly completedAt: string;
  readonly before: number;
  readonly after: number;
  readonly opponentElo: number;
  readonly beginner: boolean;
  readonly placementGame?: number;
  readonly result: "Won" | "Lost" | "Draw";
}

export function placementCount(latest: RatingEntry | undefined): number | null {
  if (!latest) return 0;
  return latest.placementGame !== undefined &&
    latest.placementGame < PLACEMENT_GAMES
    ? latest.placementGame
    : null;
}

export function ratingHistory(
  games: readonly GameRecord[],
): readonly RatingEntry[] {
  let elo = INITIAL_PLAYER_ELO;
  const history: RatingEntry[] = [];
  for (const game of games.toSorted(
    (a, b) =>
      (a.completedAt ?? "").localeCompare(b.completedAt ?? "") ||
      a.id.localeCompare(b.id),
  )) {
    if (
      game.origin.type !== "tutor" ||
      tutorGameMode(game) !== "rated" ||
      game.origin.opponentElo === undefined ||
      game.completedAt === null ||
      game.result === null ||
      game.playerColor === null
    )
      continue;
    const result =
      game.result === "draw"
        ? "Draw"
        : game.result === `${game.playerColor}-win`
          ? "Won"
          : "Lost";
    const score = result === "Won" ? 1 : result === "Lost" ? 0 : 0.5;
    if (history.length === 0 && game.ratingPolicy === undefined)
      elo = LEGACY_INITIAL_ELO;
    const count = placementCount(history.at(-1));
    const placementGame =
      game.ratingPolicy === "placement-v1" && count !== null
        ? count + 1
        : undefined;
    const opponentElo =
      game.origin.beginnerOpponent?.target ?? game.origin.opponentElo;
    const expected = 1 / (1 + 10 ** ((opponentElo - elo) / 400));
    const after = Math.max(
      MIN_PLAYER_ELO,
      Math.round(
        elo + (placementGame === undefined ? 32 : 320) * (score - expected),
      ),
    );
    history.push({
      gameId: game.id,
      completedAt: game.completedAt,
      before: elo,
      after,
      opponentElo,
      beginner: game.origin.beginnerOpponent !== undefined,
      ...(placementGame === undefined ? {} : { placementGame }),
      result,
    });
    elo = after;
  }
  return history;
}
