// Builds the offline "Test yourself" pack: about 30 Lichess puzzles per tactic
// unit for club ratings. A puzzle's unit comes from its Lichess theme tags
// (the rarest curriculum tag, ignoring phase and location tags), so the pack
// does not depend on ChessCue's own models. Stockfish rechecks that the first
// solution move is the clear best move. Games cited under research_notes are
// skipped so the benchmarks stay independent.
// Usage: node scripts/material/build-follow-up-puzzles.mjs
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";
import { Chess } from "chess.js";
import { openEngine } from "./engine.mjs";

const root = new URL("../../", import.meta.url).pathname;
const SEED = "follow-up-puzzles-v1";
const PER_UNIT = 30;
const UNITS = [
  "count-captures",
  "double-attack",
  "line-tactics",
  "open-attack-line",
  "change-the-defender",
  "test-a-sacrifice",
  "mating-patterns",
  "simple-mates",
];
const CONTEXT_TAGS = new Set(["endgame", "kingsideAttack"]);
// A unique solution: the first move beats the second choice by 1.5 pawns, or mates.
const MARGIN_CP = 150;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
const gameIds = (text) =>
  [...text.matchAll(/lichess\.org\/(?:game\/)?([A-Za-z0-9]{8})/g)].map(
    (m) => m[1],
  );
const excluded = new Set(
  filesUnder(join(root, "research_notes")).flatMap((path) =>
    gameIds(readFileSync(path, "utf8")),
  ),
);

const tagUnit = new Map();
(function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!node || typeof node !== "object") return;
  if (typeof node.id === "string" && Array.isArray(node.exercises))
    for (const e of node.exercises) if (e.tag) tagUnit.set(e.tag, node.id);
  Object.values(node).forEach(walk);
})(
  JSON.parse(
    readFileSync(join(root, "scripts/material/curriculum-draft.json"), "utf8"),
  ),
);

const csv = "data/generated/lichess-puzzles-bootstrap-100k.csv";
const lines = readFileSync(join(root, csv), "utf8").trim().split("\n");
const header = lines[0].split(",");
const rows = lines.slice(1).map((line) => {
  const cells = line.split(",");
  return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""]));
});
const frequency = new Map();
for (const row of rows)
  for (const theme of row.Themes.split(" "))
    if (tagUnit.has(theme))
      frequency.set(theme, (frequency.get(theme) ?? 0) + 1);

const rank = (id) =>
  createHash("sha256")
    .update(SEED + id)
    .digest("hex");
const candidates = new Map(UNITS.map((unit) => [unit, []]));
for (const row of rows) {
  const rating = Number(row.Rating);
  if (
    rating < 1000 ||
    rating > 1800 ||
    Number(row.Popularity) < 80 ||
    Number(row.NbPlays) < 200
  )
    continue;
  const [game] = gameIds(row.GameUrl);
  if (!game || excluded.has(game)) continue;
  const tags = row.Themes.split(" ").filter(
    (t) => tagUnit.has(t) && !CONTEXT_TAGS.has(t),
  );
  if (!tags.length) continue;
  const unit = tagUnit.get(
    tags.toSorted(
      (a, b) => (frequency.get(a) ?? 0) - (frequency.get(b) ?? 0),
    )[0],
  );
  candidates.get(unit)?.push(row);
}

const engine = await openEngine();
const puzzles = [];
for (const unit of UNITS) {
  let kept = 0;
  const pool = candidates
    .get(unit)
    .toSorted((a, b) => rank(a.PuzzleId).localeCompare(rank(b.PuzzleId)));
  for (const row of pool) {
    if (kept >= PER_UNIT) break;
    const [setup, ...solution] = row.Moves.split(" ");
    const board = new Chess(row.FEN);
    board.move(setup);
    const fen = board.fen();
    const [best, second] = await engine.search(fen);
    if (!best || best.uci !== solution[0]) continue;
    const mate = best.evaluationCp > 90_000;
    if (!mate && second && best.evaluationCp - second.evaluationCp < MARGIN_CP)
      continue;
    puzzles.push({
      id: row.PuzzleId,
      unitId: unit,
      fen,
      solution,
      rating: Number(row.Rating),
      source: row.GameUrl,
    });
    kept++;
  }
  console.log(unit, kept, "of", pool.length, "candidates");
}
engine.close();
writeFileSync(
  join(root, "scripts/material/follow-up-puzzles.generated.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      source: `${csv} seed=${SEED} perUnit=${PER_UNIT} rating=1000-1800 marginCp=${MARGIN_CP}`,
      engine: "Stockfish 19 Lite, 700 ms, MultiPV 3",
      puzzles,
    },
    null,
    1,
  ) + "\n",
);
console.log(puzzles.length, "puzzles");
