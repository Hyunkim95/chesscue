// Trains the curriculum unit classifier from Lichess puzzles whose themes
// match each unit's own curriculum tags, and writes
// scripts/material/unit-classifier.generated.json.
// Games used anywhere under research_notes, including the drill-matching dev
// and test sets, are excluded so those benchmarks stay independent.
// Run: node scripts/material/train-unit-classifier.mjs
import { createHash } from "node:crypto";
import { URL } from "node:url";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { lineEvidence } from "../../src/domain/analysis/line-evidence.ts";
import { withFactPairs } from "../../src/domain/curriculum/unit-classifier.ts";

const root = new URL("../../", import.meta.url).pathname;
const PUZZLES = "data/generated/lichess-puzzles-bootstrap-100k.csv";
const SEED = "drill-matching-train-v1";
const PER_UNIT = 600;
const MIN_FEATURE_EXAMPLES = 5;
const EPOCHS = 300;
const RATE = 0.5;
const L2 = 1e-3;
// Mate counts appear on nearly every mating puzzle, so they only exclude an
// example when the unit itself teaches a mate count.
const MATE_COUNTS = new Set(["mateIn1", "mateIn2"]);

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
const gameIds = (text) =>
  [...text.matchAll(/lichess\.org\/(?:game\/)?([A-Za-z0-9]{8})/g)].map(
    (match) => match[1],
  );
const excludedGames = new Set(
  [
    ...filesUnder(join(root, "research_notes")),
    join(root, "src/domain/material/starter.generated.json"),
  ].flatMap((path) => gameIds(readFileSync(path, "utf8"))),
);

const unitTags = new Map();
(function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!node || typeof node !== "object") return;
  if (typeof node.id === "string" && Array.isArray(node.exercises)) {
    const tags = [...new Set(node.exercises.flatMap((e) => e.tag ?? []))];
    if (tags.length) unitTags.set(node.id, tags);
  }
  Object.values(node).forEach(walk);
})(
  JSON.parse(
    readFileSync(join(root, "scripts/material/curriculum-draft.json"), "utf8"),
  ),
);
const allTags = new Set([...unitTags.values()].flat());

const csv = readFileSync(join(root, PUZZLES), "utf8");
const lines = csv.trim().split("\n");
const header = lines[0].split(",");
const rank = (id) =>
  createHash("sha256")
    .update(SEED + id)
    .digest("hex");
const rows = lines
  .slice(1)
  .map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(
      header.map((key, i) => [key, cells[i] ?? ""]),
    );
    return { ...row, rank: rank(row.PuzzleId) };
  })
  .toSorted((a, b) => a.rank.localeCompare(b.rank));

const games = new Set();
const examples = [];
for (const [unitId, tags] of unitTags)
  for (const tag of tags) {
    const quota = Math.floor(PER_UNIT / tags.length);
    let taken = 0;
    for (const row of rows) {
      if (taken === quota) break;
      const themes = row.Themes.split(" ");
      if (!themes.includes(tag)) continue;
      const otherTag = themes.some(
        (theme) =>
          theme !== tag &&
          allTags.has(theme) &&
          !(MATE_COUNTS.has(theme) && !MATE_COUNTS.has(tag)),
      );
      const [game] = gameIds(row.GameUrl);
      if (otherTag || !game || excludedGames.has(game) || games.has(game))
        continue;
      const [setup, ...line] = row.Moves.split(" ");
      const board = new Chess(row.FEN);
      board.move(setup);
      const evidence = lineEvidence(board.fen(), line);
      if (!evidence.ok) continue;
      games.add(game);
      examples.push({ unitId, features: withFactPairs(evidence.facts) });
      taken++;
    }
  }

const units = [...new Set(examples.map((e) => e.unitId))];
const counts = new Map();
for (const { features } of examples)
  for (const feature of features)
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
const vocabulary = [...counts]
  .filter(([, count]) => count >= MIN_FEATURE_EXAMPLES)
  .map(([feature]) => feature)
  .sort();
const index = new Map(vocabulary.map((feature, i) => [feature, i]));
const data = examples.map(({ unitId, features }) => ({
  x: features.flatMap((f) => (index.has(f) ? [index.get(f)] : [])),
  y: units.indexOf(unitId),
}));

const bias = vocabulary.length;
const weights = units.map(() => new Float64Array(vocabulary.length + 1));
function probabilities(x) {
  const scores = weights.map((w) => x.reduce((sum, i) => sum + w[i], w[bias]));
  const max = Math.max(...scores);
  const exp = scores.map((s) => Math.exp(s - max));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / total);
}
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const gradients = units.map(() => new Float64Array(vocabulary.length + 1));
  for (const { x, y } of data) {
    const p = probabilities(x);
    for (let k = 0; k < units.length; k++) {
      const error = p[k] - (k === y ? 1 : 0);
      for (const i of x) gradients[k][i] += error;
      gradients[k][bias] += error;
    }
  }
  for (let k = 0; k < units.length; k++)
    for (let i = 0; i <= bias; i++)
      weights[k][i] -=
        RATE * (gradients[k][i] / data.length + L2 * weights[k][i]);
}

const csvHash = createHash("sha256").update(csv).digest("hex").slice(0, 16);
writeFileSync(
  join(root, "scripts/material/unit-classifier.generated.json"),
  JSON.stringify({
    schemaVersion: 1,
    trainedFrom: `${PUZZLES}#${csvHash} seed=${SEED} perUnit=${PER_UNIT} examples=${examples.length}`,
    units,
    vocabulary,
    weights: weights.map((w) => [...w].map((v) => Number(v.toFixed(4)))),
  }) + "\n",
);
console.log(
  `Trained on ${examples.length} puzzles: ${units.length} units, ${vocabulary.length} features.`,
);
