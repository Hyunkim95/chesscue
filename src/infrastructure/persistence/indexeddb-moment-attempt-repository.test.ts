import "fake-indexeddb/auto";

import { openDB } from "idb";
import { afterEach, expect, it } from "vitest";

import { attemptRecord } from "../../domain/progress/test-fixtures";
import { deleteChessTutorDatabase } from "./chess-tutor-database";
import { IndexedDbMomentAttemptRepository } from "./indexeddb-moment-attempt-repository";

const opened: { repository: IndexedDbMomentAttemptRepository; name: string }[] =
  [];

function repository(
  name = `moments-${String(opened.length)}-${String(Date.now())}`,
) {
  const created = new IndexedDbMomentAttemptRepository(name);
  opened.push({ repository: created, name });
  return created;
}

afterEach(async () => {
  for (const { repository: open, name } of opened.splice(0)) {
    open.close();
    await deleteChessTutorDatabase(name);
  }
});

it("stores attempts immutably and lists them in completion order", async () => {
  const store = repository();
  const later = attemptRecord({ completedAt: "2026-11-27T10:00:00.000Z" });
  const earlier = attemptRecord({ completedAt: "2026-11-27T09:00:00.000Z" });
  expect((await store.add(later)).ok).toBe(true);
  expect((await store.add(earlier)).ok).toBe(true);
  expect((await store.add(later)).ok).toBe(true);
  const changed = await store.add({ ...later, outcome: "shown" });
  expect(changed).toMatchObject({ ok: false, error: { code: "conflict" } });
  const listed = await store.listAll();
  expect(listed.ok && listed.value.map(({ id }) => id)).toEqual([
    earlier.id,
    later.id,
  ]);
});

it("rejects a record that fails validation", async () => {
  const result = await repository().add({
    ...attemptRecord(),
    firstMoveUci: "Ng5+",
  });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "invalid-record" },
  });
});

it("adds the store when upgrading a version 4 database", async () => {
  const name = `moments-upgrade-${String(Date.now())}`;
  const old = await openDB(name, 4, {
    upgrade(database) {
      database.createObjectStore("games", { keyPath: "id" });
    },
  });
  old.close();
  const store = repository(name);
  expect((await store.add(attemptRecord())).ok).toBe(true);
});
