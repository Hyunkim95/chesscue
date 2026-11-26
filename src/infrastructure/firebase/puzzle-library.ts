import {
  collection,
  type QueryDocumentSnapshot,
  startAfter,
  getDocsFromServer,
  limit,
  query,
  where,
} from "firebase/firestore";
import type { z } from "zod";

import {
  libraryCourseSchema,
  libraryMotifSchema,
  libraryPuzzleSchema,
} from "../../domain/material/puzzle-library";
import { initializeFirebaseClient } from "./firebase-client";

async function read<T extends { id: string; version: number }>(
  name: string,
  schema: z.ZodType<T>,
  motifId?: string,
  allPages = false,
): Promise<T[]> {
  const client = initializeFirebaseClient();
  if (client.status !== "ready") return [];
  const records = collection(client.services.firestore, name);
  const bounded =
    motifId === undefined
      ? query(records, limit(50))
      : query(records, where("motifId", "==", motifId), limit(50));
  const results: T[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const snapshot = await getDocsFromServer(
      cursor ? query(bounded, startAfter(cursor)) : bounded,
    );
    for (const document of snapshot.docs) {
      const result = schema.safeParse(document.data());
      if (!result.success) continue;
      const { id, version } = result.data;
      const expectedId = version === 1 ? id : id + "-v" + String(version);
      if (expectedId === document.id) results.push(result.data);
    }
    cursor =
      allPages && snapshot.size === 50 ? snapshot.docs.at(-1) : undefined;
  } while (cursor);
  return results;
}

export async function readLibraryCatalog(allMotifs = false) {
  const [motifs, curricula] = await Promise.allSettled([
    read("puzzleMotifs", libraryMotifSchema, undefined, allMotifs),
    read("puzzleCurricula", libraryCourseSchema),
  ]);
  return {
    motifs: motifs.status === "fulfilled" ? motifs.value : [],
    curricula: curricula.status === "fulfilled" ? curricula.value : [],
  };
}

export function readLibraryPuzzles(motifId: string, allPages = false) {
  return read("puzzleLibrary", libraryPuzzleSchema, motifId, allPages);
}
