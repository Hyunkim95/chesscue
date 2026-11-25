import { openDB, type DBSchema } from "idb";
import { z } from "zod";

const noteBase = {
  id: z.string().min(1),
  thread: z.string().min(1),
  ply: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
};
const noteSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...noteBase,
      kind: z.literal("text"),
      text: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...noteBase,
      kind: z.literal("reply"),
      text: z.string().min(1).max(800),
      momentPly: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      ...noteBase,
      kind: z.literal("voice"),
      audio: z
        .instanceof(Blob)
        .refine(
          (blob) =>
            blob.size > 0 &&
            blob.size <= 2_000_000 &&
            /^(?:audio\/(?:webm|ogg|mp4|aac|wav|mpeg))(?:;|$)/i.test(blob.type),
        ),
    })
    .strict(),
]);

export type RookNote = z.infer<typeof noteSchema>;
interface RookNotesDatabase extends DBSchema {
  notes: {
    key: string;
    value: RookNote;
    indexes: { "by-thread": string };
  };
}

const openNotes = () =>
  openDB<RookNotesDatabase>("chesscue-rook-notes", 1, {
    upgrade(database) {
      const notes = database.createObjectStore("notes", { keyPath: "id" });
      notes.createIndex("by-thread", "thread");
    },
  });

export async function readRookNotes(
  thread: string,
): Promise<readonly RookNote[]> {
  const database = await openNotes();
  try {
    const rows: readonly unknown[] = await database.getAllFromIndex(
      "notes",
      "by-thread",
      thread,
    );
    return rows
      .flatMap((row) => {
        const result = noteSchema.safeParse(row);
        return result.success && result.data.thread === thread
          ? [result.data]
          : [];
      })
      .toSorted(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
  } finally {
    database.close();
  }
}

export async function saveRookTurn(
  message: Extract<RookNote, { kind: "text" }>,
  reply: Extract<RookNote, { kind: "reply" }>,
): Promise<void> {
  const checkedMessage = noteSchema.parse(message);
  const checkedReply = noteSchema.parse(reply);
  const database = await openNotes();
  try {
    const transaction = database.transaction("notes", "readwrite");
    await Promise.all([
      transaction.store.add(checkedMessage),
      transaction.store.add(checkedReply),
      transaction.done,
    ]);
  } finally {
    database.close();
  }
}
