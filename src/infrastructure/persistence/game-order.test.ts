import "fake-indexeddb/auto";

import { openDB } from "idb";
import { afterEach, expect, test } from "vitest";

import { createGameId, type GameRecord } from "../../domain/game/types";
import { deleteChessTutorDatabase } from "./chess-tutor-database";
import { IndexedDbGameRepository } from "./indexeddb-game-repository";

const names: string[] = [];
const repositories: IndexedDbGameRepository[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((item) => item.close()));
  await Promise.all(names.splice(0).map(deleteChessTutorDatabase));
});

const game = (index: number, completed = true): GameRecord => ({
  schemaVersion: 1,
  id: createGameId("game-" + String(index).padStart(3, "0")),
  origin: { type: "pgn-upload", sourceName: "lichess.pgn" },
  initialFen: "start",
  moves: [],
  // Imported games order by the PGN date, not by when they were saved.
  pgn: `[UTCDate "2025.01.${String((index % 28) + 1).padStart(2, "0")}"]\n\n1-0`,
  playerColor: "white",
  result: completed ? "white-win" : null,
  createdAt: "2026-11-28T10:00:00.000Z",
  completedAt: completed ? "2026-11-28T10:00:00.000Z" : null,
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
});

async function walk(repository: IndexedDbGameRepository, limit: number) {
  const ids: string[] = [];
  let after = null;
  for (;;) {
    const page = await repository.listCompletedPage(after, limit);
    if (!page.ok) throw new Error(page.error.message);
    ids.push(...page.value.games.map(({ id }) => id));
    if (page.value.next === null) return ids;
    after = page.value.next;
  }
}

test("indexes an existing history on upgrade and pages it newest first", async () => {
  const name = "game-order-" + crypto.randomUUID();
  names.push(name);
  // A version 5 history saved before the index existed.
  const old = await openDB(name, 5, {
    upgrade(database) {
      database.createObjectStore("games", { keyPath: "id" });
      database.createObjectStore("syncReceipts");
    },
  });
  for (let index = 0; index < 25; index++) await old.put("games", game(index));
  await old.put("games", game(99, false));
  old.close();

  const repository = new IndexedDbGameRepository(name);
  repositories.push(repository);
  const paged = await walk(repository, 10);
  const all = await repository.listCompleted();
  if (!all.ok) throw new Error(all.error.message);

  expect(paged).toHaveLength(25);
  expect(paged).not.toContain("game-099");
  expect(new Set(paged)).toEqual(new Set(all.value.map(({ id }) => id)));
  // Newest played first: 25 January down to 1 January.
  expect(paged[0]).toBe("game-024");
  expect(paged.at(-1)).toBe("game-000");
});

test("a newly saved game joins the index in its played order", async () => {
  const name = "game-order-" + crypto.randomUUID();
  names.push(name);
  const repository = new IndexedDbGameRepository(name);
  repositories.push(repository);
  expect((await repository.put(game(3))).ok).toBe(true);
  expect((await repository.put(game(10))).ok).toBe(true);
  expect((await repository.put(game(5, false))).ok).toBe(true);

  expect(await walk(repository, 1)).toEqual(["game-010", "game-003"]);
});

test("a game written straight to storage still joins the index", async () => {
  const name = "game-order-" + crypto.randomUUID();
  names.push(name);
  const writer = new IndexedDbGameRepository(name);
  repositories.push(writer);
  expect((await writer.put(game(1))).ok).toBe(true);
  await writer.close();
  // A seed or older writer that bypasses put.
  const raw = await openDB(name);
  await raw.put("games", game(7));
  raw.close();

  const reader = new IndexedDbGameRepository(name);
  repositories.push(reader);
  expect(await walk(reader, 10)).toEqual(["game-007", "game-001"]);
});
