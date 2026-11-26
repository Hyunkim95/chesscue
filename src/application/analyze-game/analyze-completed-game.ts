import { Chess } from "chess.js";

import { classifyLearningTheme } from "../../domain/analysis/classify-theme";
import type {
  LearningMoment,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import { validateMoveAnalysisFact } from "../../domain/analysis/validate-fact";
import type { GameRecord, PlayerColor } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";
import type {
  AnalysisCandidate,
  AnalysisEngine,
  AnalysisEngineFailure,
  PositionAnalysis,
} from "./analysis-engine";
import { selectLearningMoments } from "./select-learning-moments";

export interface AnalyzeCompletedGameInput {
  readonly game: GameRecord;
  readonly playerColor?: PlayerColor;
  readonly engine: AnalysisEngine;
  readonly analysisVersion: string;
  readonly timeBudgetPerPositionMs: number;
  readonly signal: AbortSignal;
}

export interface CompletedGameAnalysis {
  readonly facts: readonly MoveAnalysisFact[];
  readonly moments: readonly LearningMoment[];
  readonly analyzedPlayerMoves: number;
}

export type CompletedGameAnalysisFailure =
  | { readonly code: "incomplete-game"; readonly message: string }
  | { readonly code: "missing-player-color"; readonly message: string }
  | { readonly code: "invalid-game"; readonly message: string }
  | {
      readonly code: "engine-failure";
      readonly message: string;
      readonly cause: AnalysisEngineFailure;
      readonly partialFacts: readonly MoveAnalysisFact[];
    }
  | { readonly code: "invalid-fact"; readonly message: string };

function colorCode(color: PlayerColor): "w" | "b" {
  return color === "white" ? "w" : "b";
}

function normalizeScore(
  score: number,
  sideToMove: "w" | "b",
  playerColor: "w" | "b",
): number {
  return sideToMove === playerColor ? score : -score;
}

function legalPrincipalVariation(
  fen: string,
  moves: readonly string[],
): string[] | null {
  const chess = new Chess(fen);
  const validated: string[] = [];
  try {
    for (const uci of moves) {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
      });
      validated.push(uci);
    }
  } catch {
    return null;
  }
  return validated;
}

function validatedCandidates(
  analysis: PositionAnalysis,
  fen: string,
  sideToMove: "w" | "b",
  playerColor: "w" | "b",
): {
  readonly uci: string;
  readonly san: string;
  readonly evaluationCp: number;
  readonly principalVariation: string[];
}[] {
  return analysis.candidates.flatMap((candidate: AnalysisCandidate) => {
    const principalVariation = legalPrincipalVariation(
      fen,
      candidate.principalVariation,
    );
    if (principalVariation?.[0] !== candidate.uci) return [];
    try {
      const chess = new Chess(fen);
      const move = chess.move({
        from: candidate.uci.slice(0, 2),
        to: candidate.uci.slice(2, 4),
        ...(candidate.uci.length === 5
          ? { promotion: candidate.uci.slice(4, 5) }
          : {}),
      });
      return [
        {
          uci: candidate.uci,
          san: move.san,
          evaluationCp: normalizeScore(
            candidate.evaluationCpFromSideToMove,
            sideToMove,
            playerColor,
          ),
          principalVariation,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function analyzePosition(
  engine: AnalysisEngine,
  fen: string,
  timeBudgetMs: number,
  signal: AbortSignal,
): Promise<Result<PositionAnalysis, AnalysisEngineFailure>> {
  return engine.analyze({ fen, timeBudgetMs, multiPv: 3, signal });
}

function engineFailure(
  cause: AnalysisEngineFailure,
  partialFacts: readonly MoveAnalysisFact[],
): CompletedGameAnalysisFailure {
  return {
    code: "engine-failure",
    message: cause.message,
    cause,
    partialFacts,
  };
}

export async function analyzeCompletedGame(
  input: AnalyzeCompletedGameInput,
): Promise<Result<CompletedGameAnalysis, CompletedGameAnalysisFailure>> {
  if (input.game.completedAt === null || input.game.result === null) {
    return err({
      code: "incomplete-game",
      message: "Only completed games can be analyzed.",
    });
  }
  const selectedColor = input.playerColor ?? input.game.playerColor;
  if (selectedColor === null) {
    return err({
      code: "missing-player-color",
      message:
        "Choose which side belongs to the learner before analyzing an imported game.",
    });
  }
  if (input.signal.aborted) {
    return err(
      engineFailure(
        { code: "cancelled", message: "Analysis was cancelled." },
        [],
      ),
    );
  }

  const initialized = await input.engine.initialize(input.signal);
  if (!initialized.ok) return err(engineFailure(initialized.error, []));

  let chess: Chess;
  try {
    chess = new Chess(input.game.initialFen);
  } catch {
    return err({
      code: "invalid-game",
      message: "The initial game position is invalid.",
    });
  }

  const player = colorCode(selectedColor);
  const provisionalFacts: MoveAnalysisFact[] = [];

  for (const recordedMove of input.game.moves) {
    const fenBefore = chess.fen();
    const turnBefore = chess.turn();
    const isPlayerMove = turnBefore === player;
    let before: PositionAnalysis | null = null;

    if (isPlayerMove) {
      const result = await analyzePosition(
        input.engine,
        fenBefore,
        input.timeBudgetPerPositionMs,
        input.signal,
      );
      if (!result.ok) return err(engineFailure(result.error, provisionalFacts));
      before = result.value;
    }

    let applied;
    try {
      applied = chess.move({
        from: recordedMove.uci.slice(0, 2),
        to: recordedMove.uci.slice(2, 4),
        ...(recordedMove.uci.length === 5
          ? { promotion: recordedMove.uci.slice(4, 5) }
          : {}),
      });
    } catch {
      return err({
        code: "invalid-game",
        message: `Move ${String(recordedMove.ply)} is illegal in the stored position.`,
      });
    }
    if (applied.after !== recordedMove.fenAfter) {
      return err({
        code: "invalid-game",
        message: `Move ${String(recordedMove.ply)} does not match its stored position.`,
      });
    }
    if (!isPlayerMove || before === null) continue;

    const beforeCandidates = validatedCandidates(
      before,
      fenBefore,
      turnBefore,
      player,
    );
    const bestBefore = beforeCandidates[0];
    let evaluationAfterCp: number | undefined;
    if (chess.isGameOver()) {
      evaluationAfterCp = chess.isCheckmate() ? 99_999 : 0;
    } else {
      const afterResult = await analyzePosition(
        input.engine,
        chess.fen(),
        input.timeBudgetPerPositionMs,
        input.signal,
      );
      if (!afterResult.ok)
        return err(engineFailure(afterResult.error, provisionalFacts));
      evaluationAfterCp = validatedCandidates(
        afterResult.value,
        chess.fen(),
        chess.turn(),
        player,
      )[0]?.evaluationCp;
    }
    if (bestBefore === undefined || evaluationAfterCp === undefined) {
      return err({
        code: "invalid-fact",
        message: `Stockfish returned no fully legal line for move ${String(recordedMove.ply)}.`,
      });
    }

    const impactCp = Math.max(0, bestBefore.evaluationCp - evaluationAfterCp);
    const fact: MoveAnalysisFact = {
      schemaVersion: 1,
      gameId: input.game.id,
      ply: recordedMove.ply,
      fenBefore,
      playedMoveUci: recordedMove.uci,
      playedMoveSan: recordedMove.san,
      evaluationBeforeCp: bestBefore.evaluationCp,
      evaluationAfterCp,
      impactCp,
      phase:
        recordedMove.ply <= 20
          ? "opening"
          : recordedMove.ply <= 60
            ? "middlegame"
            : "endgame",
      theme: classifyLearningTheme({
        bestMoveUci: bestBefore.uci,
        fenBefore,
        playedMoveUci: recordedMove.uci,
        ply: recordedMove.ply,
        impactCp,
      }),
      recurrence: 0,
      curricularRelevance: Math.min(100, Math.round(impactCp / 5)),
      candidates: beforeCandidates,
      analysisVersion: input.analysisVersion,
    };
    const validated = validateMoveAnalysisFact(fact);
    if (!validated.ok)
      return err({ code: "invalid-fact", message: validated.reason });
    provisionalFacts.push(validated.fact);
  }

  const themeCounts = new Map<string, number>();
  for (const fact of provisionalFacts) {
    themeCounts.set(fact.theme, (themeCounts.get(fact.theme) ?? 0) + 1);
  }
  const facts = provisionalFacts.map((fact) => ({
    ...fact,
    recurrence: Math.max(0, (themeCounts.get(fact.theme) ?? 1) - 1),
  }));
  const selected = selectLearningMoments(facts);
  if (selected.rejectedFacts.length > 0) {
    return err({
      code: "invalid-fact",
      message:
        selected.rejectedFacts[0]?.reason ??
        "A generated analysis fact was invalid.",
    });
  }

  return ok({
    facts,
    moments: selected.moments,
    analyzedPlayerMoves: facts.length,
  });
}
