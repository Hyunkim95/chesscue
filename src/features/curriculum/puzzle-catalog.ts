import seedJson from "../../../scripts/material/library-seed.generated.json?raw";
import expansionJson from "../../../scripts/material/library-expansion.generated.json?raw";
import {
  librarySeedSchema,
  type LibraryPuzzle,
} from "../../domain/material/puzzle-library";

const seed = librarySeedSchema.parse(JSON.parse(seedJson));
const expansion = librarySeedSchema.parse(JSON.parse(expansionJson));
export const installed = {
  motifs: [...seed.motifs, ...expansion.motifs],
  curricula: [...seed.curricula, ...expansion.curricula],
  puzzles: [...seed.puzzles, ...expansion.puzzles],
};

export function merge<T extends { id: string; version: number }>(
  base: readonly T[],
  updates: readonly T[],
) {
  const latest = new Map(base.map((item) => [item.id, item]));
  for (const item of updates) {
    if (item.version >= (latest.get(item.id)?.version ?? 0)) {
      latest.set(item.id, item);
    }
  }
  return [...latest.values()];
}

export function puzzlesByRating(puzzles: readonly LibraryPuzzle[]) {
  return puzzles.toSorted(
    (left, right) => (left.rating ?? Infinity) - (right.rating ?? Infinity),
  );
}

function matchingPuzzles(
  available: Pick<typeof installed, "motifs" | "puzzles">,
  motifs: readonly string[],
) {
  const matching = new Map(
    available.motifs
      .filter(({ name }) => motifs.includes(name.trim().toLowerCase()))
      .map((motif) => [motif.id, motif.version]),
  );
  return puzzlesByRating(
    available.puzzles.filter(
      (puzzle) => matching.get(puzzle.motifId) === puzzle.motifVersion,
    ),
  );
}
export function nextInstalledSkillPuzzle(
  motifs: readonly string[],
  isSolved: (puzzle: LibraryPuzzle) => boolean,
) {
  return matchingPuzzles(installed, motifs).find((puzzle) => !isSolved(puzzle));
}
export async function nextPublishedSkillPuzzle(
  motifs: readonly string[],
  isSolved: (puzzle: LibraryPuzzle) => boolean,
  signal: AbortSignal,
) {
  const { readLibraryCatalog, readLibraryPuzzles } =
    await import("../../infrastructure/firebase/puzzle-library");
  const catalog = await readLibraryCatalog(true);
  signal.throwIfAborted();
  const matching = merge(installed.motifs, catalog.motifs).filter(({ name }) =>
    motifs.includes(name.trim().toLowerCase()),
  );
  const results = await Promise.allSettled(
    matching.map(({ id }) => readLibraryPuzzles(id, true)),
  );
  signal.throwIfAborted();
  const puzzles = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  return matchingPuzzles({ motifs: matching, puzzles }, motifs).find(
    (puzzle) => !isSolved(puzzle),
  );
}
