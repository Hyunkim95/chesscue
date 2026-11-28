import {
  reviewMistakeId,
  reviewMistakeSchema,
  type ReviewMistakeEvidence,
} from "../../domain/analysis/review-mistake";
import { openChessTutorDatabase } from "./chess-tutor-database";

export async function saveReviewMistake(
  database: string,
  gameId: string,
  evidence: ReviewMistakeEvidence,
  unitId: string,
) {
  const record = reviewMistakeSchema.parse({
    ...evidence,
    version: 1,
    unitId,
    id: reviewMistakeId(gameId, evidence.fen),
    gameId,
    savedAt: new Date().toISOString(),
    completed: false,
  });
  const db = await openChessTutorDatabase(database);
  try {
    const transaction = db.transaction("reviewMistakes", "readwrite");
    const inserted = (await transaction.store.getKey(record.id)) === undefined;
    if (inserted) await transaction.store.add(record);
    await transaction.done;
    return inserted;
  } finally {
    db.close();
  }
}

export async function listReviewMistakes(database: string) {
  const db = await openChessTutorDatabase(database);
  try {
    const records: unknown[] = await db.getAll("reviewMistakes");
    return records
      .flatMap((value) => {
        const checked = reviewMistakeSchema.safeParse(value);
        return checked.success ? [checked.data] : [];
      })
      .sort(
        (a, b) =>
          b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id),
      );
  } finally {
    db.close();
  }
}

export async function completeReviewMistake(database: string, id: string) {
  const db = await openChessTutorDatabase(database);
  try {
    const transaction = db.transaction("reviewMistakes", "readwrite");
    const result = reviewMistakeSchema.safeParse(
      await transaction.store.get(id),
    );
    if (result.success && !result.data.completed) {
      await transaction.store.put({ ...result.data, completed: true });
    }
    await transaction.done;
  } finally {
    db.close();
  }
}
