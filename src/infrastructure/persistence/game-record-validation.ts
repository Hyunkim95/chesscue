import type {
  GameOrigin,
  GameRecord,
  RecordedMove,
} from "../../domain/game/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isGameOrigin = (value: unknown): value is GameOrigin => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "tutor":
      return (
        (value.mode === undefined ||
          value.mode === "rated" ||
          value.mode === "coached") &&
        (value.opponentElo === undefined ||
          (typeof value.opponentElo === "number" &&
            Number.isSafeInteger(value.opponentElo) &&
            value.opponentElo > 0)) &&
        (value.trainingFocus === undefined ||
          isNonEmptyString(value.trainingFocus)) &&
        (value.openingPolicyVersion === undefined ||
          isNonEmptyString(value.openingPolicyVersion))
      );
    case "pgn-paste":
      return true;
    case "pgn-upload":
      return isNonEmptyString(value.sourceName);
    default:
      return false;
  }
};

const isRecordedMove = (value: unknown): value is RecordedMove =>
  isRecord(value) &&
  Number.isInteger(value.ply) &&
  typeof value.ply === "number" &&
  value.ply > 0 &&
  isNonEmptyString(value.san) &&
  isNonEmptyString(value.uci) &&
  isNonEmptyString(value.fenAfter) &&
  isNonEmptyString(value.playedAt);

export const isGameRecord = (value: unknown): value is GameRecord => {
  if (!isRecord(value)) {
    return false;
  }

  const playerColorIsValid =
    value.playerColor === null ||
    value.playerColor === "white" ||
    value.playerColor === "black";
  const resultIsValid =
    value.result === null ||
    value.result === "white-win" ||
    value.result === "black-win" ||
    value.result === "draw";

  return (
    value.schemaVersion === 1 &&
    isNonEmptyString(value.id) &&
    isGameOrigin(value.origin) &&
    isNonEmptyString(value.initialFen) &&
    Array.isArray(value.moves) &&
    value.moves.every(isRecordedMove) &&
    (value.coachJoinedAtPly === undefined ||
      (value.origin.type === "tutor" &&
        value.origin.mode !== "coached" &&
        typeof value.coachJoinedAtPly === "number" &&
        Number.isSafeInteger(value.coachJoinedAtPly) &&
        value.coachJoinedAtPly >= 0 &&
        value.coachJoinedAtPly <= value.moves.length)) &&
    typeof value.pgn === "string" &&
    playerColorIsValid &&
    resultIsValid &&
    isNonEmptyString(value.createdAt) &&
    isNullableString(value.completedAt) &&
    isNonEmptyString(value.curriculumVersion) &&
    isNonEmptyString(value.configurationVersion) &&
    isNullableString(value.fingerprint)
  );
};

export const serializeGameRecord = (record: GameRecord): string =>
  JSON.stringify({
    schemaVersion: record.schemaVersion,
    id: record.id,
    origin: record.origin,
    initialFen: record.initialFen,
    moves: record.moves.map((move) => ({
      ply: move.ply,
      san: move.san,
      uci: move.uci,
      fenAfter: move.fenAfter,
      playedAt: move.playedAt,
    })),
    pgn: record.pgn,
    playerColor: record.playerColor,
    result: record.result,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    curriculumVersion: record.curriculumVersion,
    configurationVersion: record.configurationVersion,
    fingerprint: record.fingerprint,
    coachJoinedAtPly: record.coachJoinedAtPly,
  });
