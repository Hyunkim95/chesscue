// Inputs are the public Lichess puzzle CSV and a collection of historical PGNs.
// Select by measurable chess properties. No player, game, board or move is whitelisted.
import { Chess } from "chess.js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { openEngine } from "./engine.mjs";

const [csvFile, pgnFile, archiveUrl, output] = process.argv.slice(2);
if (!output)
  throw Error(
    "Usage: node scripts/material/mine.mjs PUZZLES.csv GAMES.pgn SOURCE_URL EVIDENCE.json",
  );
const hash = (value) => createHash("sha256").update(value).digest("hex");
const input = createReadStream(csvFile, { encoding: "utf8" });
const sample = [];
try {
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    sample.push(line);
    if (sample.length >= 3501) break;
  }
} finally {
  input.destroy();
}
const csv = sample.join("\n") + "\n";
const pgn = await readFile(pgnFile, "utf8");
const positions = [],
  historical = { rook: [], attack: [] },
  openings = [];
const quota = 2;
const engine = await openEngine();
const day = new Date().toISOString().slice(0, 10);
const used = new Set();
const central = new Set(["e4", "d4", "e5", "d5"]);
function full(theme) {
  return positions.filter((p) => p.theme === theme).length >= quota;
}
function label(headers) {
  return (
    headers.White +
    " vs. " +
    headers.Black +
    " · " +
    headers.Event +
    ", " +
    headers.Date.slice(0, 4)
  );
}
async function puzzle(theme, fen, source, predicate, contrast) {
  if (full(theme) || used.has(fen)) return false;
  const candidates = await engine.search(fen);
  const best = candidates[0];
  if (!best || !predicate(best, candidates)) return false;
  let rejectedExchange;
  if (contrast) {
    const forced = (await engine.search(fen, contrast))[0];
    if (
      !forced ||
      forced.uci !== contrast ||
      best.evaluationCp - forced.evaluationCp <= 35
    )
      return false;
    rejectedExchange = forced;
  }
  const board = new Chess(fen);
  const answers = candidates
    .filter(
      (c) =>
        best.evaluationCp - c.evaluationCp <= 35 && predicate(c, candidates),
    )
    .map((c) => c.uci);
  const bestSan = board.move(best.uci).san;
  const id = theme + "-" + hash(fen).slice(0, 12);
  positions.push({
    id,
    theme,
    fen,
    source,
    rejectedExchange,
    acceptableMoves: answers,
    difficulty: fullBefore(theme) ? "unlabeled" : "close",
    bestSan,
    verification: {
      engine: "Stockfish 19 Lite WASM",
      moveTimeMs: 700,
      multiPv: 3,
      verifiedAt: day,
      toleranceCp: 35,
      bestMoveUci: best.uci,
      principalVariation: best.principalVariation,
      candidates: candidates.map(({ uci, evaluationCp }) => ({
        uci,
        evaluationCp,
      })),
    },
  });
  used.add(fen);
  return true;
}
function fullBefore(theme) {
  return positions.some((p) => p.theme === theme);
}
try {
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [id, initial, moves, , , , , tags, url] = line.split(",");
    const uci = moves.split(" "),
      board = new Chess(initial);
    board.move(uci[0]);
    const fen = board.fen();
    const source = {
      url,
      id,
      ply: Number(url.split("#")[1]),
      sourceHash: hash(line),
    };
    if (tags.includes("mateIn1"))
      await puzzle("one-move-threat", fen, source, (c) =>
        new Chess(fen).move(c.uci).san.endsWith("#"),
      );
    if (tags.includes("hangingPiece")) {
      await puzzle("hanging-piece", fen, source, (c) => {
        const b = new Chess(fen),
          m = b.move(c.uci);
        return Boolean(
          m.captured && m.captured !== "p" && !board.isAttacked(m.to, b.turn()),
        );
      });
    }
    if (full("one-move-threat") && full("hanging-piece")) break;
  }
  for (const score of pgn.trim().split(/\r?\n(?=\[Event )/)) {
    const board = new Chess();
    try {
      board.loadPgn(score);
    } catch {
      continue;
    }
    const h = board.getHeaders(),
      moves = board.history({ verbose: true }),
      source = { url: archiveUrl, game: label(h), sourceHash: hash(score) };
    for (const [n, m] of moves.entries()) {
      const fen = m.before,
        at = { ...source, ply: n + 1 };
      if (n < 16 && m.isKingsideCastle())
        await puzzle("king-safety", fen, at, (c) =>
          new Chess(fen).move(c.uci).isKingsideCastle(),
        );
      if (
        n < 10 &&
        ["n", "b"].includes(m.piece) &&
        m.from[1] === (m.color === "w" ? "1" : "8")
      )
        await puzzle("development", fen, at, (c) => {
          const a = new Chess(fen).move(c.uci);
          return (
            ["n", "b"].includes(a.piece) &&
            a.from[1] === (a.color === "w" ? "1" : "8")
          );
        });
      if (
        !full("premature-central-exchange") &&
        n < 18 &&
        m.piece === "p" &&
        m.captured === "p" &&
        central.has(m.to)
      ) {
        await puzzle(
          "premature-central-exchange",
          fen,
          at,
          (c, all) => {
            const exchange = all.find((x) => x.uci === m.lan);
            return (
              (!exchange || all[0].evaluationCp - exchange.evaluationCp > 35) &&
              c.uci !== m.lan
            );
          },
          m.lan,
        );
      }
    }
    for (const topic of ["rook", "attack"]) {
      if (historical[topic].length) continue;
      const eligible = moves
        .map((m, i) => ({ m, i }))
        .filter(({ m, i }) => {
          if (i + 3 >= moves.length || i < 10) return false;
          return topic === "rook"
            ? m.piece === "r" && !/[qbn]/i.test(m.before.split(" ")[0])
            : m.san.endsWith("+");
        });
      const chosen = [];
      for (const { m, i } of eligible) {
        if (chosen.some((item) => Math.abs(item.source.ply - i - 1) < 4))
          continue;
        const candidates = await engine.search(m.before);
        const actual = candidates.find((c) => c.uci === m.lan);
        if (!actual || candidates[0].evaluationCp - actual.evaluationCp > 35)
          continue;
        chosen.push({
          fen: m.before,
          source: { ...source, ply: i + 1 },
          continuation: moves.slice(i, i + 2).map((m) => m.san),
          bestSan: m.san,
          verification: {
            engine: "Stockfish 19 Lite WASM",
            moveTimeMs: 700,
            multiPv: 3,
            verifiedAt: day,
            candidates,
          },
        });
        if (chosen.length === 3) break;
      }
      if (chosen.length === 3) historical[topic] = chosen;
    }
    if (positions.some((p) => p.source.sourceHash === source.sourceHash)) {
      const prefix = [];
      for (const m of moves.slice(0, 8)) {
        if (
          m.color === "b" &&
          !openings.some((e) => e.afterMoves.join(" ") === prefix.join(" "))
        ) {
          const candidates = await engine.search(m.before);
          if (
            candidates[0] &&
            candidates.some(
              (c) =>
                c.uci === m.lan &&
                candidates[0].evaluationCp - c.evaluationCp <= 35,
            )
          ) {
            for (const exercise of positions.filter(
              (p) =>
                p.source.sourceHash === source.sourceHash &&
                p.source.ply >= prefix.length + 1,
            )) {
              openings.push({
                exerciseId: exercise.id,
                theme: exercise.theme,
                afterMoves: [...prefix],
                candidateMoves: [m.lan],
                source: { ...source, ply: prefix.length + 1 },
                fen: m.before,
                verification: {
                  engine: "Stockfish 19 Lite WASM",
                  moveTimeMs: 700,
                  multiPv: 3,
                  verifiedAt: day,
                  candidates,
                },
              });
            }
          }
        }
        prefix.push(m.lan);
      }
    }
    if (
      positions.length >= 10 &&
      historical.rook.length &&
      historical.attack.length &&
      openings.length > 0
    )
      break;
  }
  if (!historical.rook.length || !historical.attack.length || !positions.length)
    throw Error("Insufficient verified historical and tactical material");
  await writeFile(
    output,
    JSON.stringify(
      {
        day,
        positions,
        historical,
        openings,
        pgnHash: hash(pgn),
        csvHash: hash(csv),
      },
      null,
      2,
    ),
  );
  console.log(
    "Verified",
    positions.length,
    "puzzles,",
    historical.rook.length + historical.attack.length,
    "historical positions,",
    openings.length,
    "opening branches",
  );
} finally {
  engine.close();
}
