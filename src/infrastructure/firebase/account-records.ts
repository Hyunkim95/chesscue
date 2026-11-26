import { sha256 } from "../../shared/sha256";
import type { GameRecord } from "../../domain/game/types";
import { isSyncedGameDocument } from "./game-document";
import { buildGameReplay } from "../../domain/analysis/replay-game";
import { validateMoveAnalysisFact } from "../../domain/analysis/validate-fact";
import { fingerprintCanonicalGame } from "../../domain/import/fingerprint";
import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import type { ReviewEvidenceRecord } from "../../application/ports/review-evidence-repository";
import {
  isAnalysisRecord,
  serializeAnalysisRecord,
} from "../persistence/analysis-record-validation";
import {
  isReviewEvidenceRecord,
  serializeReviewEvidenceRecord,
} from "../persistence/review-evidence-validation";
import {
  isGameRecord,
  serializeGameRecord,
} from "../persistence/game-record-validation";
import { analysisRecordKey } from "../persistence/chess-tutor-database";
import { valueOf, type PlayerHistory } from "../persistence/player-history";

export class CloudRecordConflict extends Error {}

export type AccountRecord =
  | { kind: "games"; value: GameRecord }
  | { kind: "analyses"; value: AnalysisRecord }
  | { kind: "reviews"; value: ReviewEvidenceRecord }
  | { kind: "practice"; value: { id: string; gameId: string } };

export const kinds = ["games", "analyses", "reviews", "practice"] as const;
export function recordId(record: AccountRecord) {
  return record.kind === "analyses"
    ? encodeURIComponent(
        analysisRecordKey(record.value.gameId, record.value.analysisVersion),
      )
    : record.value.id;
}
export function serialized(record: AccountRecord) {
  switch (record.kind) {
    case "games":
      return serializeGameRecord(record.value);
    case "analyses":
      return serializeAnalysisRecord(record.value);
    case "reviews":
      return serializeReviewEvidenceRecord(record.value);
    case "practice":
      return JSON.stringify({
        id: record.value.id,
        gameId: record.value.gameId,
      });
  }
}
export async function decodeDocument(
  kind: AccountRecord["kind"],
  id: string,
  uid: string,
  data: unknown,
) {
  if (
    !data ||
    typeof data !== "object" ||
    !("ownerId" in data) ||
    data.ownerId !== uid ||
    !("record" in data) ||
    !("contentHash" in data) ||
    !("createdAt" in data) ||
    typeof data.createdAt !== "string" ||
    !Number.isFinite(Date.parse(data.createdAt))
  )
    throw new CloudRecordConflict("Invalid cloud document");
  const v = data.record;
  let record: AccountRecord;
  if (
    kind === "games" &&
    isSyncedGameDocument(data) &&
    isGameRecord(v) &&
    v.completedAt !== null &&
    v.result !== null &&
    v.moves.every((move, i) => move.ply === i + 1) &&
    buildGameReplay(v).ok &&
    (v.origin.type === "tutor"
      ? v.fingerprint === null
      : v.fingerprint ===
        fingerprintCanonicalGame(
          v.initialFen,
          v.moves.map((m) => m.uci),
        ))
  )
    record = { kind, value: v };
  else if (
    kind === "analyses" &&
    isAnalysisRecord(v) &&
    v.facts.every((f) => validateMoveAnalysisFact(f).ok)
  )
    record = { kind, value: v };
  else if (kind === "reviews" && isReviewEvidenceRecord(v))
    record = { kind, value: v };
  else if (
    kind === "practice" &&
    v &&
    typeof v === "object" &&
    "id" in v &&
    typeof v.id === "string" &&
    "gameId" in v &&
    typeof v.gameId === "string"
  )
    record = { kind, value: { id: v.id, gameId: v.gameId } };
  else throw new CloudRecordConflict("Invalid cloud record");
  if (
    recordId(record) !== id ||
    (await sha256(serialized(record))) !== data.contentHash
  )
    throw new CloudRecordConflict("Cloud record integrity conflict");
  return record;
}
export async function localRecords(
  history: PlayerHistory,
): Promise<AccountRecord[]> {
  const [games, analyses, reviews] = await Promise.all([
    history.games.listCompletedSources(),
    history.analyses.listAll(),
    history.reviews.listAll(),
  ]);
  const records: AccountRecord[] = [];
  for (const value of valueOf(games)) records.push({ kind: "games", value });
  for (const value of valueOf(analyses))
    records.push({ kind: "analyses", value });
  for (const value of valueOf(reviews)) {
    records.push({ kind: "reviews", value });
    if (history.practiceDone(value.id))
      records.push({
        kind: "practice",
        value: { id: value.id, gameId: value.gameId },
      });
  }
  return records;
}
export async function saveDownloaded(
  history: PlayerHistory,
  record: AccountRecord,
) {
  if (record.kind === "practice") {
    history.completePractice(record.value.id);
    return;
  }
  const result =
    record.kind === "games"
      ? await history.games.put(record.value, "insert-only")
      : record.kind === "analyses"
        ? await history.analyses.put(record.value)
        : await history.reviews.put(record.value);
  if (!result.ok) {
    if (result.error.code === "unavailable")
      throw new Error(result.error.message);
    throw new CloudRecordConflict(result.error.message);
  }
}
