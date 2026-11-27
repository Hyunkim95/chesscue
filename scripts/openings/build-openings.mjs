// Builds the offline opening book from lichess-org/chess-openings (CC0) at a
// pinned commit. Each named line is replayed with chess.js and every position
// on it is keyed by its FEN without the move counters, so a game that reaches
// the same position by another move order still matches. A position records
// the opening named there, if any, and its book moves ranked by Stockfish at a
// fixed depth from a cleared hash, so the ranking is reproducible. Ties keep
// the move more named lines continue through. Counting lines alone would put
// gambits with many named sub-lines first, such as 4.b4 in the Giuoco Piano.
// Usage: node scripts/openings/build-openings.mjs
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { URL } from "node:url";
import { Chess } from "chess.js";

const REPO = "lichess-org/chess-openings";
const COMMIT = "48a8c0e733facfdc9a3723fe882e51ec28014074";
const FILES = ["a", "b", "c", "d", "e"];
const out = new URL(
  "../../src/domain/openings/openings.generated.json",
  import.meta.url,
).pathname;

const DEPTH = 12;
const positionKey = (fen) => fen.split(" ").slice(0, 4).join(" ");

// Scores each listed move from the side to move, searching only those moves.
async function openRanker() {
  const entry = createRequire(import.meta.url).resolve(
    "stockfish/bin/stockfish-19-lite-single.js",
  );
  const child = spawn(process.execPath, [entry], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ]();
  const send = (command) => child.stdin.write(command + "\n");
  async function until(prefix, read) {
    for (;;) {
      const { value, done } = await lines.next();
      if (done) throw new Error("Stockfish stopped");
      read?.(value);
      if (value.startsWith(prefix)) return;
    }
  }
  send("uci");
  await until("uciok");
  return {
    close: () => child.kill(),
    async score(fen, moves) {
      send(`setoption name MultiPV value ${String(moves.length)}`);
      send("ucinewgame");
      send("isready");
      await until("readyok");
      send("position fen " + fen);
      send(`go depth ${String(DEPTH)} searchmoves ${moves.join(" ")}`);
      const scores = new Map();
      await until("bestmove", (line) => {
        const match =
          / depth (\d+) .*?score (cp|mate) (-?\d+).*? pv (\S+)/.exec(line);
        if (!match || Number(match[1]) !== DEPTH) return;
        const n = Number(match[3]);
        scores.set(
          match[4],
          match[2] === "mate" ? Math.sign(n) * (100000 - Math.abs(n)) : n,
        );
      });
      return scores;
    },
  };
}

const rows = [];
for (const file of FILES) {
  const url = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${file}.tsv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
  const [header, ...lines] = (await response.text()).trim().split("\n");
  if (header !== "eco\tname\tpgn") throw new Error(`${url}: unexpected header`);
  for (const line of lines) {
    const [eco, name, pgn] = line.split("\t");
    if (!eco || !name || !pgn) throw new Error(`${url}: bad row ${line}`);
    rows.push({ eco, name, pgn });
  }
}

const openings = [];
const named = new Map();
const continuations = new Map();
for (const { eco, name, pgn } of rows) {
  const board = new Chess();
  const sans = pgn.replace(/\d+\.\s*/g, "").split(/\s+/);
  for (const san of sans) {
    const before = positionKey(board.fen());
    const move = board.move(san);
    const counts = continuations.get(before) ?? new Map();
    counts.set(move.lan, (counts.get(move.lan) ?? 0) + 1);
    continuations.set(before, counts);
  }
  const key = positionKey(board.fen());
  if (named.has(key)) continue; // The first listed name for a position wins.
  named.set(key, openings.length);
  openings.push([eco, name]);
}

const keys = [...new Set([...continuations.keys(), ...named.keys()])].sort();
const ranker = await openRanker();
const positions = {};
let searched = 0;
for (const key of keys) {
  const counts = [...(continuations.get(key) ?? new Map())];
  const scores =
    counts.length > 1
      ? await ranker.score(
          key + " 0 1",
          counts.map(([uci]) => uci),
        )
      : new Map();
  if (counts.length > 1 && scores.size !== counts.length)
    throw new Error(
      `${key}: Stockfish scored ${String(scores.size)} of ${String(counts.length)} moves`,
    );
  counts.sort(
    ([a, x], [b, y]) =>
      (scores.get(b) ?? 0) - (scores.get(a) ?? 0) ||
      y - x ||
      a.localeCompare(b),
  );
  positions[key] = [named.get(key) ?? -1, counts.map(([uci]) => uci).join(" ")];
  if (counts.length > 1 && ++searched % 100 === 0)
    console.log(`ranked ${String(searched)} positions`);
}
ranker.close();

writeFileSync(
  out,
  JSON.stringify({
    version: `chess-openings@${COMMIT.slice(0, 7)}`,
    source: `https://github.com/${REPO}/tree/${COMMIT}`,
    license: "CC0-1.0",
    openings,
    positions,
  }) + "\n",
);
console.log(
  `${String(rows.length)} lines, ${String(openings.length)} named positions, ${String(keys.length)} positions`,
);
