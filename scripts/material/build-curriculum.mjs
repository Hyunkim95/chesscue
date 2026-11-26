import { URL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { z } from "zod";
import { openEngine } from "./engine.mjs";
import { parseRow, replaySourceGame, verify } from "./sync-library.mjs";

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const [csvPath, output] = process.argv.slice(2);
if (!csvPath || !output) {
  throw Error(
    "Usage: node scripts/material/build-curriculum.mjs puzzles.csv curriculum.generated.json",
  );
}
const text = z.string().min(1);
const copy = {
  question: z
    .string()
    .min(8)
    .max(200)
    .regex(
      /^(what|which|how|why|where|when|would|could|can|do|is|are)\b[^.!?<>\d\n]+\?$/i,
    )
    .refine(
      (question) =>
        !/checkmate|forced|winning|losing|sacrifice|undefended|only move|guarantee|blunder/i.test(
          question,
        ),
    ),
  explanation: z.string().min(20),
};
const example = z.union([
  z
    .object({
      ...copy,
      tag: text,
      id: text.optional(),
      alsoTag: text.optional(),
      inCheck: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ ...copy, fen: text, requiredMoves: z.array(text).optional() })
    .strict(),
  z
    .object({
      ...copy,
      line: z.array(text).min(1),
      requiredMoves: z.array(text).optional(),
    })
    .strict(),
]);
const draft = z
  .object({
    version: z.literal(1),
    model: text,
    stages: z
      .array(
        z.object({
          id: text,
          title: text,
          units: z
            .array(
              z.object({
                id: text,
                title: text,
                goal: text,
                exercises: z.tuple([example, example]),
              }),
            )
            .min(1),
        }),
      )
      .length(4),
  })
  .parse(
    JSON.parse(
      await readFile(
        new URL("./curriculum-draft.json", import.meta.url),
        "utf8",
      ),
    ),
  );
const units = draft.stages.flatMap(({ units }) => units);
if (units.length !== 21 || new Set(units.map(({ id }) => id)).size !== 21)
  throw Error("Expected 21 unique curriculum units.");

const csv = await readFile(csvPath, "utf8");
const rows = csv.trim().split(/\r?\n/).slice(1);
const byId = new Map();
const byTag = new Map();
const tags = new Set(
  units.flatMap(({ exercises }) =>
    exercises.flatMap((item) => ("tag" in item && !item.id ? [item.tag] : [])),
  ),
);
for (const row of rows) {
  const fields = row.split(",");
  const [id, , , rating, deviation, popularity, plays, sourceTags] = fields;
  byId.set(id, row);
  if (
    Number(rating) < 850 ||
    Number(rating) >= 2200 ||
    Number(deviation) > 85 ||
    Number(popularity) < 85 ||
    Number(plays) < 1000
  )
    continue;
  for (const tag of (sourceTags ?? "").split(" ")) {
    if (!tags.has(tag)) continue;
    const candidates = byTag.get(tag) ?? [];
    candidates.push({ row, rating: Number(rating), plays: Number(plays) });
    byTag.set(tag, candidates);
  }
}

const runId = randomUUID();
const verifiedAt = new Date().toISOString().slice(0, 10);
const seen = new Set();
const originalUrl = "https://github.com/Hyunkim95/chesscue";
const identity = (fen) => fen.split(" ").slice(0, 4).join(" ");
const engine = await openEngine();

function demonstrates(tag, puzzle) {
  const board = new Chess(puzzle.fen);
  const material = () => board.board().flat().filter(Boolean);
  if (tag === "pawnEndgame")
    return material().every(({ type }) => type === "k" || type === "p");
  if (tag === "rookEndgame")
    return material().every(
      ({ type }) => type === "k" || type === "r" || type === "p",
    );
  const mateLength = /^mateIn([12])$/.exec(tag);
  let doubleCheck = false;
  let quiet = false;
  let fork = false;
  for (const [index, uci] of puzzle.solution.entries()) {
    const move = board.move(uci);
    if (index % 2 !== 0) continue;
    const [king] = board.findPiece({ type: "k", color: board.turn() });
    if (king && board.attackers(king, move.color).length >= 2)
      doubleCheck = true;
    if (!move.captured && !move.promotion && !board.isCheck()) quiet = true;
    const targets = material().filter(
      ({ color, type, square }) =>
        color !== move.color &&
        type !== "p" &&
        board.attackers(square, move.color).includes(move.to),
    );
    if (targets.length >= 2) fork = true;
  }
  if (mateLength)
    return (
      board.isCheckmate() &&
      puzzle.solution.length === 2 * Number(mateLength[1]) - 1
    );
  if (tag === "backRankMate") {
    const [king] = board.findPiece({ type: "k", color: board.turn() });
    return (
      board.isCheckmate() && king?.endsWith(board.turn() === "w" ? "1" : "8")
    );
  }
  if (tag === "doubleCheck") return doubleCheck;
  if (tag === "quietMove") return quiet;
  if (tag === "fork") return fork;
  return true;
}

async function fromLichess(item, second) {
  const floor = second ? 1300 : 850;
  const candidates = item.id
    ? [byId.get(item.id)]
    : (byTag.get(item.tag) ?? [])
        .filter(
          ({ rating }) =>
            rating >= floor && rating < floor + (second ? 900 : 450),
        )
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 80)
        .map(({ row }) => row);

  for (const row of candidates) {
    if (!row) continue;
    const puzzle = parseRow(row);
    if (
      !puzzle ||
      !puzzle.tags.includes(item.tag) ||
      !demonstrates(item.tag, puzzle) ||
      (item.alsoTag && !puzzle.tags.includes(item.alsoTag)) ||
      seen.has(identity(puzzle.fen)) ||
      (item.inCheck && !new Chess(puzzle.fen).isCheck())
    )
      continue;
    const verification = await verify(engine, puzzle);
    if (!verification) continue;
    const acceptableMoves = puzzle.legalMates.length
      ? puzzle.legalMates
      : [puzzle.solution[0]];
    if (
      !acceptableMoves.every((move) =>
        verification.candidates.some(
          (candidate) =>
            candidate.uci === move &&
            verification.candidates[0].evaluationCp - candidate.evaluationCp <=
              35,
        ),
      )
    )
      continue;
    let source;
    try {
      source = await replaySourceGame(puzzle);
    } catch (error) {
      if (item.id) throw error;
      continue;
    }
    if (!source) continue;
    return {
      fen: puzzle.fen,
      acceptableMoves,
      verification,
      source: {
        url: puzzle.url,
        sourceHash: puzzle.sourceHash,
        ply: source.ply,
      },
      provenance: "Position replayed from the Lichess open puzzle database.",
    };
  }
  throw Error("No verified source position for " + (item.id ?? item.tag));
}

async function original(item) {
  const board = new Chess("fen" in item ? item.fen : undefined);
  if ("line" in item) for (const move of item.line) board.move(move);
  const opponent = board.turn() === "w" ? "b" : "w";
  const [king] = board.findPiece({ type: "k", color: opponent });
  if (!king || board.isAttacked(king, board.turn()) || board.isGameOver())
    throw Error("Original position is not playable.");
  const fen = board.fen();
  const candidates = await engine.search(fen);
  const best = candidates[0];
  if (!best) throw Error("No Stockfish proof for original position.");
  const mates = board
    .moves({ verbose: true })
    .filter((move) => move.san.endsWith("#"))
    .map((move) => move.lan);
  const accepted = candidates.filter(
    (candidate) =>
      best.evaluationCp - candidate.evaluationCp <= 35 &&
      (mates.length
        ? mates.includes(candidate.uci)
        : !item.requiredMoves || item.requiredMoves.includes(candidate.uci)),
  );
  if (!accepted.length || (mates.length && accepted.length !== mates.length))
    throw Error(
      "Stockfish found different moves: " +
        candidates.map((x) => x.uci).join(", "),
    );
  return {
    fen,
    acceptableMoves: accepted.map(({ uci }) => uci),
    source: {
      url: originalUrl,
      sourceHash: hash("fen" in item ? item.fen : item.line),
      ply: board.history().length + 1,
    },
    provenance: "Original ChessCue training position.",
    verification: {
      engine: "Stockfish 19 Lite WASM",
      moveTimeMs: 700,
      multiPv: 3,
      verifiedAt,
      bestMoveUci: best.uci,
      principalVariation: best.principalVariation,
      candidates,
    },
  };
}

try {
  const stages = [];
  for (const { id, title, units: stageUnits } of draft.stages) {
    const checkedUnits = [];
    for (const unit of stageUnits) {
      const exercises = [];
      for (const [index, item] of unit.exercises.entries()) {
        try {
          const record =
            "tag" in item
              ? await fromLichess(item, index === 1)
              : await original(item);
          const fenKey = identity(record.fen);
          if (seen.has(fenKey)) throw Error("Duplicate board position");
          seen.add(fenKey);
          exercises.push({
            schemaVersion: 1,
            version: "1.0.0",
            theme: "other",
            difficulty: "close",
            id: "archive-curriculum-" + unit.id + "-" + String(index + 1),
            ...record,
            prompt: item.question,
            explanation: item.explanation,
            verification: { ...record.verification, toleranceCp: 35 },
            authorship: {
              model: draft.model,
              route: "cloud",
              runId,
              promptVersion: "chesscue-curriculum-v1",
              promptHash: hash({
                unit: unit.id,
                goal: unit.goal,
                position: record.fen,
                source: record.source,
              }),
              responseHash: hash({
                question: item.question,
                explanation: item.explanation,
              }),
            },
          });
        } catch (error) {
          throw Error(
            unit.id + " exercise " + String(index + 1) + ": " + error.message,
            { cause: error },
          );
        }
      }
      checkedUnits.push({
        id: unit.id,
        title: unit.title,
        goal: unit.goal,
        exercises,
      });
      console.log(
        unit.id,
        exercises.map(({ source, acceptableMoves }) => [
          source.url,
          acceptableMoves,
        ]),
      );
    }
    stages.push({ id, title, units: checkedUnits });
  }
  const temporary = output + "." + runId + ".tmp";
  await writeFile(
    temporary,
    JSON.stringify({ version: draft.version, runId, stages }, null, 2) + "\n",
  );
  await rename(temporary, output);
  console.log("Verified", units.length, "units and", seen.size, "positions.");
} finally {
  engine.close();
}
