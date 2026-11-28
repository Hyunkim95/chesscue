import { gameIdeaEvidence } from "./game-evidence";
import type { MomentAttemptRecord, ProgressInput } from "./types";

type GamePosition = Extract<MomentAttemptRecord["source"], { kind: "game" }>;

interface IdeaSummary {
  readonly unitId: string;
  readonly games: number;
}

export interface SkyGameReview {
  readonly strength: IdeaSummary | undefined;
  readonly focus:
    | (IdeaSummary & { readonly retry: GamePosition | undefined })
    | undefined;
}

interface IdeaHistory {
  readonly games: Set<string>;
  newest: number;
  retry?: { readonly position: GamePosition; readonly at: number };
}

function positionKey(gameId: string, ply: number) {
  return JSON.stringify([gameId, ply]);
}

export function summarizeSkyGames({
  games,
  attempts,
  curriculum,
}: Pick<ProgressInput, "games" | "attempts" | "curriculum">): SkyGameReview {
  const units = new Set(curriculum.flatMap(({ unitIds }) => unitIds));
  const solved = new Set(
    attempts.flatMap(({ outcome, source }) =>
      source.kind === "game" && outcome !== "shown"
        ? [positionKey(source.gameId, source.ply)]
        : [],
    ),
  );
  const byOutcome = {
    played: new Map<string, IdeaHistory>(),
    missed: new Map<string, IdeaHistory>(),
  };

  for (const { unitId, gameId, ply, outcome, completedAt } of gameIdeaEvidence(
    games,
  )) {
    if (!units.has(unitId)) continue;
    const group = byOutcome[outcome];
    const at = Date.parse(completedAt);
    const history = group.get(unitId) ?? {
      games: new Set<string>(),
      newest: at,
    };
    history.games.add(gameId);
    history.newest = Math.max(history.newest, at);
    const current = history.retry;
    const newer =
      current === undefined ||
      at > current.at ||
      (at === current.at &&
        (gameId.localeCompare(current.position.gameId) ||
          ply - current.position.ply) < 0);
    if (
      outcome === "missed" &&
      newer &&
      !solved.has(positionKey(gameId, ply))
    ) {
      history.retry = { position: { kind: "game", gameId, ply }, at };
    }
    group.set(unitId, history);
  }

  const rank = (group: ReadonlyMap<string, IdeaHistory>) =>
    [...group].sort(
      ([unitA, a], [unitB, b]) =>
        b.games.size - a.games.size ||
        b.newest - a.newest ||
        unitA.localeCompare(unitB),
    );
  const [strength] = rank(byOutcome.played);
  const misses = rank(byOutcome.missed);
  const focus =
    misses.find(([, { retry }]) => retry !== undefined) ?? misses[0];
  return {
    strength: strength && {
      unitId: strength[0],
      games: strength[1].games.size,
    },
    focus: focus && {
      unitId: focus[0],
      games: focus[1].games.size,
      retry: focus[1].retry?.position,
    },
  };
}
