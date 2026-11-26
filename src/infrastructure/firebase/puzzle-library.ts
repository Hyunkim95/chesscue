import {
  collection,
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
): Promise<T[]> {
  const client = initializeFirebaseClient();
  if (client.status !== "ready") return [];
  const records = collection(client.services.firestore, name);
  const bounded =
    motifId === undefined
      ? query(records, limit(50))
      : query(records, where("motifId", "==", motifId), limit(50));
  const snapshot = await getDocsFromServer(bounded);
  return snapshot.docs.flatMap((document) => {
    const result = schema.safeParse(document.data());
    if (!result.success) return [];
    const { id, version } = result.data;
    const expectedId = version === 1 ? id : id + "-v" + String(version);
    return expectedId === document.id ? [result.data] : [];
  });
}

export async function readLibraryCatalog() {
  const [motifs, curricula] = await Promise.allSettled([
    read("puzzleMotifs", libraryMotifSchema),
    read("puzzleCurricula", libraryCourseSchema),
  ]);
  return {
    motifs: motifs.status === "fulfilled" ? motifs.value : [],
    curricula: curricula.status === "fulfilled" ? curricula.value : [],
  };
}

export function readLibraryPuzzles(motifId: string) {
  return read("puzzleLibrary", libraryPuzzleSchema, motifId);
}
