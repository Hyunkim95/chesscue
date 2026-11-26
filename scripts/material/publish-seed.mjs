import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { z } from "zod";
import { firestore } from "./sync-library.mjs";

const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!file)
  throw Error(
    "Usage: node scripts/material/publish-seed.mjs seed.generated.json [--dry-run]",
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
const author = z.object({
  model: z.string().min(1),
  route: z.enum(["cloud", "on-device"]),
  runId: z.uuid(),
  promptVersion: z.string().min(1),
  promptHash: hash,
  responseHash: hash,
});
const versioned = {
  schemaVersion: z.literal(1),
  id: hash,
  version: z.number().int().positive(),
  authorship: author,
};
const source = z.object({
  dataset: z.literal("https://database.lichess.org/#puzzles"),
  game: z.url({ hostname: /^lichess\.org$/, protocol: /^https$/ }),
  tags: z.array(z.string().min(1)).min(1),
});
const check = z.object({
  uci,
  evaluationCp: z.number().int(),
  principalVariation: z.array(uci).min(1),
  depth: z.number().int().positive(),
});
const proof = z.object({
  engine: z.literal("Stockfish 19 Lite WASM"),
  moveTimeMs: z.number().int().positive(),
  multiPv: z.number().int().min(1).max(5),
  verifiedAt: z.iso.date(),
  bestMoveUci: uci,
  principalVariation: z.array(uci).min(1),
  candidates: z.array(check).min(1),
  checkedSteps: z
    .array(
      z.object({
        ply: z.number().int().positive(),
        fen: z.string(),
        played: uci,
        candidates: z.array(check).min(1),
      }),
    )
    .min(1),
});
const motif = z.object({
  ...versioned,
  name: z.string().min(3).max(80),
  source,
});
const puzzle = z.object({
  schemaVersion: z.literal(1),
  id: hash,
  motifId: hash,
  motifVersion: z.number().int().positive(),
  fen: z.string(),
  acceptableMoves: z.array(uci).min(1),
  solution: z.array(uci).min(1),
  rating: z.number().int(),
  ratingDeviation: z.number().int(),
  question: z
    .string()
    .trim()
    .min(8)
    .max(180)
    .regex(/^[^!?<>\d\n]+\?$/),
  explanation: z.string().min(1),
  source: source.extend({
    lichessId: z.string().regex(/^[a-zA-Z0-9]{5}$/),
    sourceHash: hash,
    pgnHash: hash,
    ply: z.number().int().positive(),
  }),
  verification: proof,
  authorship: author,
});
const curriculum = z.object({
  ...versioned,
  motifId: hash,
  motifVersion: z.number().int().positive(),
  title: z.string().min(3),
  goal: z.string().min(8),
  puzzleIds: z.array(hash).min(3),
});
const seed = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.uuid(),
    generatedAt: z.iso.datetime(),
    input: z.object({
      dataset: z.literal("https://database.lichess.org/#puzzles"),
      sha256: hash,
      rows: z.number().int().positive(),
    }),
    motifs: z.array(motif).min(1),
    puzzles: z.array(puzzle).min(1),
    curricula: z.array(curriculum).min(1),
  })
  .parse(JSON.parse(await readFile(file, "utf8")));
const motifs = new Map(seed.motifs.map((item) => [item.id, item]));
const puzzles = new Map(seed.puzzles.map((item) => [item.id, item]));
if (
  motifs.size !== seed.motifs.length ||
  puzzles.size !== seed.puzzles.length ||
  new Set(seed.curricula.map((item) => item.id)).size !== seed.curricula.length
)
  throw Error("Duplicate seed identity");
if (
  [...seed.motifs, ...seed.puzzles, ...seed.curricula].some(
    (item) => item.authorship.runId !== seed.runId,
  )
)
  throw Error("Seed contains mismatched generation provenance");
for (const item of seed.puzzles) {
  const tag = motifs.get(item.motifId);
  if (
    !tag ||
    tag.version !== item.motifVersion ||
    !tag.source.tags.every((value) => item.source.tags.includes(value))
  )
    throw Error("Puzzle source does not support the curriculum tag");
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        item.fen.split(" ").slice(0, 4),
        item.acceptableMoves.toSorted(),
      ]),
    )
    .digest("hex");
  if (identity !== item.id)
    throw Error("Puzzle identity does not match its board and answers");
  if (
    item.verification.checkedSteps.length !==
    Math.ceil(item.solution.length / 2)
  )
    throw Error("Missing solver-move verification");
  const board = new Chess(item.fen);
  for (const [index, move] of item.solution.entries()) {
    if (index % 2 === 0) {
      const step = item.verification.checkedSteps[index / 2];
      if (
        step?.ply !== index + 1 ||
        step.fen !== board.fen() ||
        step.played !== move
      )
        throw Error("Verification does not match the solution");
      const best = step.candidates[0];
      if (!best) throw Error("Missing engine candidate");
      for (const candidate of step.candidates) {
        const branch = new Chess(step.fen);
        if (candidate.principalVariation[0] !== candidate.uci)
          throw Error("Corrupt Stockfish proof");
        for (const reply of candidate.principalVariation) branch.move(reply);
      }
      const mates = board
        .moves({ verbose: true })
        .filter((m) => m.san.endsWith("#"))
        .map((m) => m.lan);
      const verified = mates.length
        ? mates.includes(move)
        : step.candidates.some(
            (candidate) =>
              candidate.uci === move &&
              best.evaluationCp - candidate.evaluationCp <= 35,
          );
      if (!verified)
        throw Error("Solution is outside the checked Stockfish range");
      if (
        index === 0 &&
        JSON.stringify(item.acceptableMoves.toSorted()) !==
          JSON.stringify((mates.length ? mates : [move]).toSorted())
      )
        throw Error("Published answers differ from the verified solution");
    }
    board.move(move);
  }
}
for (const item of seed.curricula) {
  let previous = -Infinity;
  if (
    motifs.get(item.motifId)?.version !== item.motifVersion ||
    new Set(item.puzzleIds).size !== item.puzzleIds.length
  )
    throw Error("Invalid curriculum identity");
  for (const id of item.puzzleIds) {
    const puzzle = puzzles.get(id);
    if (!puzzle || puzzle.motifId !== item.motifId || puzzle.rating < previous)
      throw Error("Broken curriculum link or difficulty order");
    previous = puzzle.rating;
  }
}
if (!process.argv.includes("--dry-run")) {
  const project = process.env.LIBRARY_FIREBASE_PROJECT,
    token = process.env.LIBRARY_FIRESTORE_TOKEN;
  if (!project || !token) throw Error("Configure the library publisher");
  const db = firestore(project, token);
  if (!(await db.get("librarySync", seed.runId))) {
    for (const [collection, items] of [
      ["puzzleMotifs", seed.motifs],
      ["puzzleLibrary", seed.puzzles],
      ["puzzleCurricula", seed.curricula],
    ]) {
      for (const item of items) {
        const version =
          collection === "puzzleLibrary" ? item.motifVersion : item.version;
        const documentId = version === 1 ? item.id : item.id + "-v" + version;
        const written = await db.create(collection, documentId, item);
        if (!written) {
          const existing = await db.get(collection, documentId);
          if (
            !existing ||
            (version > 1 &&
              existing.fields?.authorship?.mapValue?.fields?.runId
                ?.stringValue !== item.authorship.runId) ||
            (collection === "puzzleLibrary" &&
              existing.fields?.motifId?.stringValue !== item.motifId)
          )
            throw Error(
              "A published library record conflicts with " + documentId,
            );
        }
      }
    }
    await db.create("librarySync", seed.runId, {
      generatedAt: seed.generatedAt,
      curriculumCount: seed.curricula.length,
      puzzleCount: seed.puzzles.length,
    });
  }
}
console.log(
  JSON.stringify({
    curricula: seed.curricula.length,
    puzzles: seed.puzzles.length,
    motifs: seed.motifs.length,
    dryRun: process.argv.includes("--dry-run"),
  }),
);
