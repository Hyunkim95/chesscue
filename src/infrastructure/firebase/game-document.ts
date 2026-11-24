import type { GameRecord } from "../../domain/game/types";

import { isGameRecord } from "../persistence/game-record-validation";

export interface SyncedGameDocument {
  readonly ownerId: string;
  readonly contentHash: string;
  readonly record: GameRecord;
  readonly createdAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isSyncedGameDocument = (
  value: unknown,
): value is SyncedGameDocument =>
  isRecord(value) &&
  typeof value.ownerId === "string" &&
  value.ownerId.length > 0 &&
  typeof value.contentHash === "string" &&
  /^[a-f0-9]{64}$/.test(value.contentHash) &&
  isGameRecord(value.record) &&
  typeof value.createdAt === "string" &&
  value.createdAt.length > 0;
