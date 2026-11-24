import { expect, test } from "@playwright/test";

test("the packaged Stockfish analysis asset returns a legal scored line", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    return new Promise<{ bestMove: string; sawScore: boolean }>(
      (resolve, reject) => {
        const worker = new Worker("/stockfish/stockfish-19-lite-single.js", {
          name: "stockfish-analysis-smoke",
        });
        let sawScore = false;
        const timeout = window.setTimeout(() => {
          worker.terminate();
          reject(new Error("Stockfish analysis exceeded five seconds"));
        }, 5_000);
        worker.onerror = (event) => {
          window.clearTimeout(timeout);
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.onmessage = (event: MessageEvent<unknown>) => {
          if (typeof event.data !== "string") return;
          if (event.data === "uciok") worker.postMessage("isready");
          else if (event.data === "readyok") {
            worker.postMessage("setoption name MultiPV value 2");
            worker.postMessage(
              "position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            );
            worker.postMessage("go movetime 100");
          } else if (
            event.data.startsWith("info ") &&
            event.data.includes(" score ")
          ) {
            sawScore = true;
          } else if (event.data.startsWith("bestmove ")) {
            window.clearTimeout(timeout);
            const bestMove = event.data.split(/\s+/)[1] ?? "";
            worker.terminate();
            resolve({ bestMove, sawScore });
          }
        };
        worker.postMessage("uci");
      },
    );
  });

  expect(result.sawScore).toBe(true);
  expect(result.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
});
