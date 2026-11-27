import type { Result } from "../../shared/result/result";
import { IndexedDbGameRepository } from "./indexeddb-game-repository";
import { IndexedDbAnalysisRepository } from "./indexeddb-analysis-repository";
import { IndexedDbReviewEvidenceRepository } from "./indexeddb-review-evidence-repository";
import { IndexedDbMomentAttemptRepository } from "./indexeddb-moment-attempt-repository";
import { openChessTutorDatabase } from "./chess-tutor-database";
import { isGameRecord } from "./game-record-validation";
import { tutorGameMode, type GameRecord } from "../../domain/game/types";

export function valueOf<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export class PlayerHistory {
  readonly name: string;
  readonly games: IndexedDbGameRepository;
  readonly analyses: IndexedDbAnalysisRepository;
  readonly reviews: IndexedDbReviewEvidenceRepository;
  readonly moments: IndexedDbMomentAttemptRepository;
  constructor(readonly uid: string | null) {
    this.name =
      uid === null
        ? "adaptive-chess-tutor"
        : "chesscue-account-" + encodeURIComponent(uid);
    this.games = new IndexedDbGameRepository(this.name);
    this.analyses = new IndexedDbAnalysisRepository(this.name);
    this.reviews = new IndexedDbReviewEvidenceRepository(this.name);
    this.moments = new IndexedDbMomentAttemptRepository(this.name);
  }
  key(name: string) {
    return this.uid === null ? name : this.name + "/" + name;
  }
  practiceDone(id: string) {
    try {
      return (
        localStorage.getItem(this.key("chesscue-due-practice:" + id)) === "done"
      );
    } catch {
      return false;
    }
  }
  completePractice(id: string) {
    localStorage.setItem(this.key("chesscue-due-practice:" + id), "done");
  }
}

export const guestHistory = new PlayerHistory(null);

export async function availableGuestGames(uid: string): Promise<GameRecord[]> {
  const db = await openChessTutorDatabase(guestHistory.name);
  try {
    const tx = db.transaction(["games", "guestClaims"]);
    const records: unknown[] = await tx.objectStore("games").getAll();
    if (!records.every(isGameRecord))
      throw new Error("Guest history could not be read.");
    const eligible = await Promise.all(
      records.map(async (game) => {
        const claim = await tx.objectStore("guestClaims").get(game.id);
        return (game.completedAt !== null || game.moves.length > 0) &&
          (claim === undefined || (claim.uid === uid && !claim.copied))
          ? game
          : null;
      }),
    );
    return eligible.filter((game) => game !== null);
  } finally {
    db.close();
  }
}

// Reserve each original before copying. A second tab can resume an interrupted
// copy for the same UID, but cannot claim it for a different account.
export async function copyGuestGames(
  target: PlayerHistory,
  games: readonly GameRecord[],
) {
  const uid = target.uid;
  if (uid === null) throw new Error("Sign in to add guest games.");
  const db = await openChessTutorDatabase(guestHistory.name);
  try {
    const latestFirst = games.toSorted(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
    const failed: string[] = [];
    for (const offered of latestFirst) {
      try {
        const tx = db.transaction(["guestClaims", "games"], "readwrite");
        const claims = tx.objectStore("guestClaims");
        const existing = await claims.get(offered.id);
        if (existing && (existing.uid !== uid || existing.copied)) continue;
        const game: unknown = await tx.objectStore("games").get(offered.id);
        if (!isGameRecord(game)) throw new Error("Guest game is unavailable.");
        await claims.put({ uid, copied: false }, game.id);
        await tx.done;
        valueOf(await target.games.put(game, "insert-only"));
        for (const analysis of valueOf(
          await guestHistory.analyses.listByGame(game.id),
        )) {
          valueOf(await target.analyses.put(analysis));
        }
        for (const review of valueOf(
          await guestHistory.reviews.listByGame(game.id),
        )) {
          valueOf(await target.reviews.put(review));
          if (guestHistory.practiceDone(review.id))
            target.completePractice(review.id);
        }
        if (
          game.completedAt === null &&
          !localStorage.getItem(target.key("chesscue-active-play-mode"))
        ) {
          localStorage.setItem(
            target.key("chesscue-active-play-mode"),
            JSON.stringify({ gameId: game.id, mode: tutorGameMode(game) }),
          );
        }
        await db.put("guestClaims", { uid, copied: true }, game.id);
      } catch {
        failed.push(offered.id);
      }
    }
    return failed;
  } finally {
    db.close();
  }
}
