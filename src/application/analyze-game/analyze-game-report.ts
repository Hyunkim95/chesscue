import { Chess, type Color } from "chess.js";

import { gradeReportMove } from "../../domain/analysis/move-grades";
import { buildGameReplay } from "../../domain/analysis/replay-game";
import type { GameRecord, PlayerColor } from "../../domain/game/types";
import { err, ok, type Result } from "../../shared/result/result";
import type { AnalysisEngine } from "./analysis-engine";

interface ScoredPosition {
  readonly turn: Color;
  readonly cp: number;
  readonly best?: {
    readonly uci: string;
    readonly san: string;
    readonly fen: string;
  };
}

export interface GameReportMove extends ReturnType<typeof gradeReportMove> {
  readonly ply: number;
  readonly side: PlayerColor;
  readonly san: string;
  readonly bestUci: string;
  readonly bestSan: string;
  readonly bestFen: string;
}

export interface GameReport {
  readonly evaluations: readonly number[];
  readonly moves: readonly GameReportMove[];
}

const mateCp = 100_000;

export async function analyzeGameReport(
  game: GameRecord,
  engine: AnalysisEngine,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<Result<GameReport, string>> {
  const cancelled = () => signal.aborted;
  if (cancelled()) return err("Report analysis was cancelled.");
  if (!game.completedAt || !game.result || game.moves.length === 0)
    return err("This game has no completed moves to analyze.");

  const replay = buildGameReplay(game);
  if (!replay.ok) return err(replay.message);

  const initialized = await engine.initialize(signal);
  if (!initialized.ok) return err(initialized.error.message);

  const positions: ScoredPosition[] = [];
  for (const { fen } of replay.frames) {
    const board = new Chess(fen);
    const turn = board.turn();
    if (cancelled()) return err("Report analysis was cancelled.");
    if (board.isGameOver()) {
      positions.push({ turn, cp: board.isCheckmate() ? -mateCp : 0 });
    } else {
      const result = await engine.analyze({
        fen,
        signal,
        multiPv: 1,
        depth: 13,
        timeBudgetMs: 400,
      });
      if (!result.ok) return err(result.error.message);
      const candidate = result.value.candidates[0];
      const best = board
        .moves({ verbose: true })
        .find(({ lan }) => lan === candidate?.uci);
      if (
        !candidate ||
        !best ||
        candidate.principalVariation[0] !== candidate.uci ||
        !Number.isFinite(candidate.evaluationCpFromSideToMove) ||
        Math.abs(candidate.evaluationCpFromSideToMove) > mateCp
      )
        return err(
          "Stockfish did not return a verified move for a saved position.",
        );
      positions.push({
        turn,
        cp: candidate.evaluationCpFromSideToMove,
        best: { uci: best.lan, san: best.san, fen: best.after },
      });
    }
    if (cancelled()) return err("Report analysis was cancelled.");
    onProgress?.(positions.length, replay.frames.length);
  }

  const moves: GameReportMove[] = [];
  for (const [index, move] of game.moves.entries()) {
    const before = positions[index],
      after = positions[index + 1];
    if (!before?.best || !after)
      return err("The report is missing a checked position.");
    moves.push({
      ply: move.ply,
      san: move.san,
      side: before.turn === "w" ? "white" : "black",
      bestUci: before.best.uci,
      bestSan: before.best.san,
      bestFen: before.best.fen,
      ...gradeReportMove(before.cp, -after.cp, before.best.uci === move.uci),
    });
  }

  return ok({
    moves,
    evaluations: positions.map(({ turn, cp }) => (turn === "w" ? cp : -cp)),
  });
}
