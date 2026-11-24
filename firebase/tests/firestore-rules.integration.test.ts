import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

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
    },
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

  it("denies unlisted collections by default", async () => {
    const firestore = environment.authenticatedContext("owner-1").firestore();
    await assertFails(
      firestore.doc("users/owner-1/profile/current").set({ level: 1 }),
    );
  });
});
