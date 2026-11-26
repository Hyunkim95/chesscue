import { Chess } from "chess.js";
import type { AnalysisEngine } from "../../application/analyze-game/analysis-engine";
import type { HistoricalGame } from "../../domain/study/historical-game";
import {
  checkedLine,
  type HistoricalProof,
} from "../../domain/material/verified";

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function groundHistoricalGame(
  game: HistoricalGame,
  sourceGame: string,
  ply: number,
  prompt: string,
  generated: { question: string; notation: string },
  engine: AnalysisEngine,
  signal: AbortSignal,
) {
  try {
    if (!(await engine.initialize(signal)).ok) return null;
    const result = await engine.analyze({
      fen: game.lesson.fen,
      multiPv: 3,
      timeBudgetMs: 700,
      signal,
    });
    if (!result.ok || signal.aborted) return null;
    const candidates = result.value.candidates.toSorted(
      (a, b) => b.evaluationCpFromSideToMove - a.evaluationCpFromSideToMove,
    );
    const best = candidates[0];
    if (
      !best ||
      candidates.some(
        (c) =>
          c.principalVariation[0] !== c.uci ||
          !checkedLine(game.lesson.fen, c.principalVariation),
      )
    )
      return null;
    const proof: HistoricalProof = {
      source: { url: game.scoreUrl, ply, sourceHash: await sha256(sourceGame) },
      authorship: {
        model: "gemini-3.5-flash-lite",
        route: "cloud",
        runId: crypto.randomUUID(),
        promptVersion: "historical-study-v2",
        promptHash: await sha256(prompt),
        responseHash: await sha256(JSON.stringify(generated)),
      },
      verification: {
        engine: "Stockfish 19 Lite WASM",
        moveTimeMs: 700,
        multiPv: 3,
        toleranceCp: 35,
        verifiedAt: new Date().toISOString().slice(0, 10),
        bestMoveUci: best.uci,
        principalVariation: [...best.principalVariation],
        candidates: candidates.map((c) => ({
          uci: c.uci,
          evaluationCp: c.evaluationCpFromSideToMove,
        })),
      },
    };
    const san = new Chess(game.lesson.fen).move(best.uci).san;
    return {
      ...game,
      proof,
      lesson: {
        ...game.lesson,
        question: generated.question,
        insight:
          game.lesson.insight +
          " Stockfish’s highest-scoring checked move was " +
          san +
          ".",
      },
    };
  } finally {
    engine.dispose();
  }
}
