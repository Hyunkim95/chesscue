import { listenStandings, type Standing } from "./race-standings";
import { Chess } from "chess.js";
import { placementCount, ratingHistory } from "../../domain/game/rating";
import { tutorGameMode } from "../../domain/game/types";
import { withRaceHistory } from "./race-history";
import {
  serverTimestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  getDocsFromServer,
  query,
  limit,
} from "firebase/firestore";
import { z } from "zod";
import {
  goalSchema,
  memberSchema,
  raceId,
  raceSchema,
  raceProgress,
  winSchema,
  type RaceGoal,
} from "../../domain/race/elo-race";
import type { FirebaseClientServices } from "./firebase-client";
export function createRaceStore({ auth, firestore }: FirebaseClientServices) {
  function player() {
    if (!navigator.onLine) throw new Error("Reconnect to continue.");
    if (!auth.currentUser) throw new Error("Sign in to continue.");
    return {
      uid: auth.currentUser.uid,
      name:
        auth.currentUser.displayName?.trim().slice(0, 100) ?? "ChessCue player",
    };
  }
  async function enroll(id: string, newGoal?: RaceGoal) {
    const { uid, name } = player(),
      race = doc(firestore, "races", raceId.parse(id));
    return withRaceHistory(firestore, uid, async (tx, games) => {
      const membership = doc(race, "members", uid);
      if ((await tx.get(membership)).exists())
        return { result: id, changed: false };
      const goal =
        newGoal ?? raceSchema.parse((await tx.get(race)).data()).goal;
      const latest = ratingHistory(games).at(-1);
      const startingElo =
        latest && placementCount(latest) === null ? latest.after : null;
      if (
        goal.kind === "milestone" &&
        startingElo !== null &&
        goal.value <= startingElo
      )
        throw new Error("Choose a milestone above your current Elo.");
      const entry = { name, joinedAt: new Date().toISOString(), startingElo };
      const conflicts = await getDocsFromServer(
        query(collection(firestore, "users", uid, "raceConflicts"), limit(1)),
      );
      if (newGoal) tx.set(race, { version: 1, goal });
      tx.set(membership, {
        publishedAt: serverTimestamp(),
        ...entry,
        ...raceProgress(ratingHistory(games), entry, goal),
        disputed: !conflicts.empty,
      });
      tx.set(doc(firestore, "users", uid, "raceLinks", id), { goal });
      return { result: id, changed: true };
    });
  }
  return {
    create: () => enroll(crypto.randomUUID(), { kind: "highest" }),
    join: (id: string) => enroll(id),
    async share(gameId: string, ply: number, race: string | null) {
      const { uid, name } = player();
      return withRaceHistory(firestore, uid, async (tx, games) => {
        const game = games.find((g) => g.id === gameId);
        if (
          !game?.playerColor ||
          game.result !== game.playerColor + "-win" ||
          tutorGameMode(game) !== "rated" ||
          !game.completedAt
        )
          throw new Error("Sync your rated win before sharing.");
        const fen = ply === 1 ? game.initialFen : game.moves[ply - 2]?.fenAfter;
        if (
          !fen ||
          !game.moves[ply - 1] ||
          new Chess(fen).turn() !== (game.playerColor === "white" ? "w" : "b")
        )
          throw new Error("Choose a position before your move.");
        const history = ratingHistory(games),
          entry = history.find((e) => e.gameId === game.id);
        let target: number | null = null,
          raceElo: number | null = null;
        if (race) {
          const ref = doc(firestore, "races", raceId.parse(race));
          const member = memberSchema.parse(
            (await tx.get(doc(ref, "members", uid))).data(),
          );
          if (member.disputed || member.joinedAt >= game.completedAt)
            throw new Error("This win is outside the race.");
          const goal = raceSchema.parse((await tx.get(ref)).data()).goal;
          const progress = raceProgress(history, member, goal);
          target = progress.target;
          raceElo =
            goal.kind === "highest"
              ? (progress.peak ?? null)
              : progress.current;
        }
        const id = crypto.randomUUID();
        const win = winSchema.parse({
          name,
          fen,
          line: game.moves.slice(ply - 1, ply + 7).map((m) => m.uci),
          side: game.playerColor,
          race,
          elo: entry && placementCount(entry) === null ? entry.after : null,
          target,
          raceElo,
        });
        tx.set(doc(firestore, "sharedWins", id), win);
        return { result: id, changed: false };
      });
    },
    async goal(id: string) {
      return raceSchema.parse(
        (await getDoc(doc(firestore, "races", raceId.parse(id)))).data(),
      ).goal;
    },
    async win(id: string) {
      return winSchema.parse(
        (await getDoc(doc(firestore, "sharedWins", raceId.parse(id)))).data(),
      );
    },
    links(uid: string, next: (links: RaceLink[]) => void, fail: () => void) {
      return onSnapshot(
        collection(firestore, "users", uid, "raceLinks"),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
          try {
            next(
              snap.docs.map((d) => ({
                id: raceId.parse(d.id),
                goal: goalSchema.parse(d.get("goal")),
              })),
            );
          } catch {
            fail();
          }
        },
        fail,
      );
    },
    members(id: string, next: (members: Standing[]) => void, fail: () => void) {
      return listenStandings(firestore, id, next, fail);
    },
  };
}
export const linkSchema = z.object({ id: raceId, goal: goalSchema });
export { standingSchema } from "./race-standings";
export type RaceLink = z.infer<typeof linkSchema>;
export type { Standing } from "./race-standings";
