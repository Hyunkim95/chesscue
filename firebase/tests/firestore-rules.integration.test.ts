import { createHash } from "node:crypto";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const emulatorAvailable = process.env.FIRESTORE_EMULATOR_HOST !== undefined;
const describeWithEmulator = emulatorAvailable ? describe : describe.skip;

describeWithEmulator("Firestore ownership and immutable game rules", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "chess-tutor-rules-test",
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  const gameDocument = (ownerId: string, gameId: string) => ({
    ownerId,
    contentHash: "a".repeat(64),
    createdAt: "2026-11-24T12:00:00.000Z",
    record: {
      id: gameId,
      schemaVersion: 1,
      result: "draw",
      completedAt: "2026-11-24T12:00:00.000Z",
    },
  });

  it("lets distinct accounts read the same published puzzle and reserves writes for the publisher", async () => {
    const path = "puzzleLibrary/sample-puzzle";
    const record = {
      schemaVersion: 1,
      id: "sample-puzzle",
      motifId: "sample-motif",
    };
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(path).set(record);
      await context
        .firestore()
        .doc("puzzleCurricula/starter")
        .set({ puzzleIds: [record.id] });
    });
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    const guest = environment.unauthenticatedContext().firestore();
    for (const client of [alice, bob, guest]) {
      const document = await assertSucceeds(client.doc(path).get());
      expect(document.data()).toEqual(record);
      await assertSucceeds(client.collection("puzzleLibrary").limit(10).get());
      await assertSucceeds(client.doc("puzzleCurricula/starter").get());
      await assertFails(
        client.doc("puzzleCurricula/starter").set({ puzzleIds: [] }),
      );
      await assertFails(client.doc(path).set({ ...record, motifId: "edited" }));
      await assertFails(
        client.doc("puzzleMotifs/forged").set({ name: "forged" }),
      );
      await assertFails(client.doc("librarySync/lichess").get());
    }
    await assertFails(alice.collection("puzzleLibrary").get());
  });

  it("accepts authenticated immutable PGNs and reserves publication for the miner", async () => {
    const pgn = '[Event "é"]\n\n1. e4 1-0';
    const id = createHash("sha256").update(pgn).digest("hex");
    const contributor = environment.authenticatedContext("guest").firestore();
    const request = contributor.doc("pgnSubmissions/" + id);
    await assertSucceeds(request.set({ pgn }));
    await assertSucceeds(request.set({ pgn }));
    await assertFails(request.get());
    await assertFails(request.set({ pgn: "different" }));
    await assertFails(request.set({ pgn, verified: true }));
    await assertFails(request.delete());
    await assertFails(
      environment
        .unauthenticatedContext()
        .firestore()
        .doc(request.path)
        .set({ pgn }),
    );
    await assertFails(contributor.doc("sharedGames/" + id).set({ pgn }));
    await assertFails(
      contributor.doc("submittedMateEvidence/" + id).set({ found: 5 }),
    );
  });

  it("lets an owner create and read an immutable game", async () => {
    const firestore = environment.authenticatedContext("owner-1").firestore();
    const reference = firestore.doc("users/owner-1/games/game-1");

    await assertSucceeds(reference.set(gameDocument("owner-1", "game-1")));
    await assertSucceeds(reference.get());
  });

  it("prevents another user from reading the game", async () => {
    const owner = environment.authenticatedContext("owner-1").firestore();
    await assertSucceeds(
      owner
        .doc("users/owner-1/games/game-1")
        .set(gameDocument("owner-1", "game-1")),
    );

    const stranger = environment.authenticatedContext("owner-2").firestore();
    await assertFails(stranger.doc("users/owner-1/games/game-1").get());
  });

  it("prevents updates after immutable creation", async () => {
    const firestore = environment.authenticatedContext("owner-1").firestore();
    const reference = firestore.doc("users/owner-1/games/game-1");
    await assertSucceeds(reference.set(gameDocument("owner-1", "game-1")));

    await assertFails(reference.update({ contentHash: "b".repeat(64) }));
  });

  it("rejects owner and path mismatches", async () => {
    const firestore = environment.authenticatedContext("owner-1").firestore();
    await assertFails(
      firestore
        .doc("users/owner-1/games/game-1")
        .set(gameDocument("owner-2", "game-1")),
    );
  });

  it("restricts immutable training records to their owner and requires their game", async () => {
    const owner = environment.authenticatedContext("owner-1").firestore();
    const stranger = environment.authenticatedContext("owner-2").firestore();
    const envelope = {
      ...gameDocument("owner-1", "game-1"),
      record: { id: "review-1", gameId: "game-1", schemaVersion: 1 },
    };
    const review = owner.doc("users/owner-1/reviews/review-1");
    await assertFails(review.set(envelope));
    await assertSucceeds(
      owner
        .doc("users/owner-1/games/game-1")
        .set(gameDocument("owner-1", "game-1")),
    );
    await assertSucceeds(review.set(envelope));
    await assertFails(review.update({ createdAt: "another date" }));
    await assertFails(stranger.doc("users/owner-1/reviews/review-1").get());
    await assertFails(
      environment
        .unauthenticatedContext()
        .firestore()
        .collection("users/owner-1/reviews")
        .get(),
    );
    const completion = {
      ...envelope,
      record: { id: "review-1", gameId: "game-1" },
    };
    await assertSucceeds(
      owner.doc("users/owner-1/practice/review-1").set(completion),
    );
    await assertFails(
      owner.doc("users/owner-1/practice/wrong").set(completion),
    );
  });

  it("keeps race standings member-only and shared wins readable only by direct link", async () => {
    const id = crypto.randomUUID();
    await environment.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db
        .doc("races/" + id)
        .set({ version: 1, goal: { kind: "gain", value: 50 } });
      await db.doc("races/" + id + "/members/ana").set({ current: 1500 });
      await db.doc("sharedWins/" + id).set({ name: "Ana" });
    });
    const member = environment.authenticatedContext("ana").firestore();
    const other = environment.authenticatedContext("ben").firestore();
    const guest = environment.unauthenticatedContext().firestore();
    await assertSucceeds(guest.doc("sharedWins/" + id).get());
    await assertSucceeds(guest.doc("races/" + id).get());
    await assertFails(guest.collection("races").get());
    await assertFails(other.collection("sharedWins").get());
    await assertFails(other.collection("races/" + id + "/members").get());
    await assertSucceeds(member.collection("races/" + id + "/members").get());
    const pilot = {
      name: "Ben",
      joinedAt: new Date().toISOString(),
      startingElo: 1200,
      baseline: 1200,
      current: 1200,
      target: 1250,
      crossedAt: null,
      disputed: false,
    };
    const ben = other.doc("races/" + id + "/members/ben");
    await assertSucceeds(ben.set(pilot));
    await assertSucceeds(ben.update({ current: 1215 }));
    await assertFails(
      member.doc("races/" + id + "/members/ben").update({ current: 1600 }),
    );
    await assertFails(ben.update({ startingElo: 1500 }));
    await assertFails(
      other.doc("races/" + id + "/members/ben").set({ current: 2000 }),
    );
    await assertFails(member.doc("sharedWins/" + id).update({ name: "Ben" }));
  });

  it("denies unlisted collections by default", async () => {
    const firestore = environment.authenticatedContext("owner-1").firestore();
    await assertFails(
      firestore.doc("users/owner-1/profile/current").set({ level: 1 }),
    );
  });
});
