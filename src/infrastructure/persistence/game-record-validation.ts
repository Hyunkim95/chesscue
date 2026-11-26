import {
  MIN_PLAYER_ELO,
  STOCKFISH_ELO_FLOOR,
} from "../../domain/game/beginner-opponent";
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
        (value.beginnerOpponent === undefined ||
          (value.mode === "rated" &&
            value.opponentElo === STOCKFISH_ELO_FLOOR &&
            isRecord(value.beginnerOpponent) &&
            value.beginnerOpponent.version === 1 &&
            typeof value.beginnerOpponent.target === "number" &&
            Number.isInteger(value.beginnerOpponent.target) &&
            value.beginnerOpponent.target >= MIN_PLAYER_ELO &&
            value.beginnerOpponent.target < STOCKFISH_ELO_FLOOR)) &&
        (value.coachNotesAtStart === undefined ||
          (value.mode === "coached" &&
            typeof value.coachNotesAtStart === "boolean")) &&
        (value.opponentElo === undefined
          ? value.mode !== "rated"
          : typeof value.opponentElo === "number" &&
            Number.isInteger(value.opponentElo) &&
            value.opponentElo >= 1320 &&
            value.opponentElo <= 3190) &&
        (value.mode !== "rated" ||
          (value.trainingFocus === undefined &&
            value.openingPolicyVersion === undefined)) &&
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
    (value.ratingPolicy === undefined ||
      (value.ratingPolicy === "placement-v1" &&
        value.origin.type === "tutor" &&
        value.origin.mode === "rated" &&
        value.coachJoinedAtPly === undefined &&
        isNonEmptyString(value.completedAt) &&
        value.result !== null)) &&
    isNonEmptyString(value.initialFen) &&
    Array.isArray(value.moves) &&
    value.moves.every(isRecordedMove) &&
    (value.coachJoinedAtPly === undefined ||
      (value.origin.type === "tutor" &&
        value.origin.mode === "rated" &&
        typeof value.coachJoinedAtPly === "number" &&
        Number.isInteger(value.coachJoinedAtPly) &&
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
    origin:
      record.origin.type === "tutor"
        ? {
            type: record.origin.type,
            mode: record.origin.mode,
            opponentElo: record.origin.opponentElo,
            ...(record.origin.beginnerOpponent
              ? {
                  beginnerOpponent: {
                    version: record.origin.beginnerOpponent.version,
                    target: record.origin.beginnerOpponent.target,
                  },
                }
              : {}),
            coachNotesAtStart: record.origin.coachNotesAtStart,
            trainingFocus: record.origin.trainingFocus,
            openingPolicyVersion: record.origin.openingPolicyVersion,
          }
        : record.origin.type === "pgn-upload"
          ? { type: record.origin.type, sourceName: record.origin.sourceName }
          : { type: record.origin.type },
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
    ...(record.ratingPolicy ? { ratingPolicy: record.ratingPolicy } : {}),
    ...(record.coachJoinedAtPly === undefined
      ? {}
      : { coachJoinedAtPly: record.coachJoinedAtPly }),
  });
