// Offline pack builder. The child runs the same Stockfish Lite single-thread build as the browser.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";

export async function openEngine() {
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
  send("setoption name MultiPV value 3");
  send("isready");
  await until("readyok");
  return {
    close: () => child.kill(),
    async search(fen, onlyMove) {
      send("ucinewgame");
      send("isready");
      await until("readyok");
      send("position fen " + fen);
      send("go movetime 700" + (onlyMove ? " searchmoves " + onlyMove : ""));
      const scores = new Map();
      await until("bestmove", (line) => {
        const match =
          / depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+).*? pv (.+)$/.exec(
            line,
          );
        if (!match) return;
        const [, depth, rank, unit, raw, pv] = match;
        const board = new Chess(fen),
          moves = pv.trim().split(/\s+/).slice(0, 12);
        try {
          for (const move of moves) board.move(move);
        } catch {
          return;
        }
        const n = Number(raw);
        scores.set(Number(rank), {
          uci: moves[0],
          evaluationCp:
            unit === "mate" ? Math.sign(n) * (100000 - Math.abs(n)) : n,
          principalVariation: moves,
          depth: Number(depth),
        });
      });
      return [...scores.values()].sort(
        (a, b) => b.evaluationCp - a.evaluationCp,
      );
    },
  };
}
