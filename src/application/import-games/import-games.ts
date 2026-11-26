import type {
  GameId,
  GameOrigin,
  GameRecord,
  PlayerColor,
  RecordedMove,
} from "../../domain/game/types";
import { parsePgnBatch } from "../../domain/import/pgn-parser";
import type {
  ImportGameItemResult,
  ImportGamesResult,
  ParsedPgnGame,
  PgnImportSource,
} from "../../domain/import/types";

export interface ImportGamesInput {
  readonly text: string;
  readonly source: PgnImportSource;
  readonly playerColor: PlayerColor;
  readonly existingFingerprints: ReadonlySet<string>;
  readonly idFactory: () => GameId;
  readonly now: () => string;
  readonly curriculumVersion: string;
  readonly configurationVersion: string;
}

function originFromSource(source: PgnImportSource): GameOrigin {
  if (source.type === "paste") return { type: "pgn-paste" };
  return { type: "pgn-upload", sourceName: source.fileName };
}

function toRecord(
  game: ParsedPgnGame,
  input: ImportGamesInput,
  importedAt: string,
): GameRecord {
  const moves: readonly RecordedMove[] = game.moves.map((move) => ({
    ply: move.ply,
    san: move.san,
    uci: move.uci,
    fenAfter: move.fenAfter,
    playedAt: importedAt,
  }));

  return {
    schemaVersion: 1,
    id: input.idFactory(),
    origin: originFromSource(input.source),
    initialFen: game.initialFen,
    moves,
    pgn: game.canonicalPgn,
    playerColor: input.playerColor,
    result: game.result,
    createdAt: importedAt,
    completedAt: importedAt,
    curriculumVersion: input.curriculumVersion,
    configurationVersion: input.configurationVersion,
    fingerprint: game.fingerprint,
  };
}

function summarize(items: readonly ImportGameItemResult[]): ImportGamesResult {
  return {
    items,
    acceptedCount: items.filter((item) => item.status === "accepted").length,
    duplicateCount: items.filter((item) => item.status === "duplicate").length,
    rejectedCount: items.filter((item) => item.status === "rejected").length,
  };
}

export function importGames(input: ImportGamesInput): ImportGamesResult {
  const parsed = parsePgnBatch(input.text);
  if (!parsed.ok) {
    return summarize([{ status: "rejected", index: 0, issue: parsed.issue }]);
  }

  const seen = new Set(input.existingFingerprints);
  const importedAt = input.now();
  const items: ImportGameItemResult[] = [];

  for (const item of parsed.items) {
    if (item.status === "rejected") {
      items.push(item);
      continue;
    }

    const { game } = item;
    if (seen.has(game.fingerprint)) {
      items.push({
        status: "duplicate",
        originalPgn: game.originalPgn,
        index: game.index,
        fingerprint: game.fingerprint,
        issue: {
          code: "duplicate-game",
          message: `Game ${String(game.index + 1)} is already in your library.`,
        },
      });
      continue;
    }

    seen.add(game.fingerprint);
    items.push({
      status: "accepted",
      index: game.index,
      originalPgn: game.originalPgn,
      game: {
        record: toRecord(game, input, importedAt),
        headers: game.headers,
      },
    });
  }

  return summarize(items);
}
