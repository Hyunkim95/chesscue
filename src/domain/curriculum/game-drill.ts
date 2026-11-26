import { sameTransferPosition } from "../transfer/validate";
import { Chess } from "chess.js";

import { buildGameReplay, buildVariationFrames } from "../analysis/replay-game";
import { REVIEW_MOVE_TOLERANCE_CP } from "../analysis/review-training";
import type { LearningMoment, MoveAnalysisFact } from "../analysis/types";
import { validateMoveAnalysisFact } from "../analysis/validate-fact";
import type { GameRecord } from "../game/types";
import { transferExercisesForTheme } from "../transfer";
import type {
  VerifiedTransferExercise,
  PracticeExercise,
} from "../transfer/types";

export interface VerifiedGameDrill {
  readonly exercise: PracticeExercise;
  readonly moveLabel: string;
  readonly played: string;
  readonly candidate: string;
  readonly phase: MoveAnalysisFact["phase"];
  readonly backRank: boolean;
  readonly mateInOne?: boolean;
  readonly completedAt: string;
  readonly imported: boolean;
  readonly followUps: readonly VerifiedTransferExercise[];
}

export interface ObservedMove {
  readonly game: GameRecord;
  readonly ply: number;
  readonly impactCp: number;
  readonly outcome: "retry" | "matched";
  readonly drill: VerifiedGameDrill;
}

export function observedGameMoves(
  game: GameRecord,
  analysis: {
    readonly facts: readonly MoveAnalysisFact[];
    readonly moments: readonly LearningMoment[];
  },
): ObservedMove[] {
  if (
    game.completedAt === null ||
    game.result === null ||
    game.playerColor === null
  )
    return [];
  const replay = buildGameReplay(game);
  if (!replay.ok) return [];
  const observations: ObservedMove[] = [];
  const seen = new Set<number>();
  for (const input of analysis.facts) {
    const checked = validateMoveAnalysisFact(input);
    if (!checked.ok) continue;
    const fact = checked.fact;
    const position = replay.frames[fact.ply - 1],
      played = replay.frames[fact.ply];
    if (
      seen.has(fact.ply) ||
      fact.gameId !== game.id ||
      position?.fen !== fact.fenBefore ||
      played?.lastMoveUci !== fact.playedMoveUci ||
      played.lastMoveSan !== fact.playedMoveSan
    )
      continue;
    const chess = new Chess(fact.fenBefore);
    if (chess.turn() !== (game.playerColor === "white" ? "w" : "b")) continue;
    const candidates = fact.candidates
      .filter(
        (candidate) =>
          candidate.principalVariation[0] === candidate.uci &&
          buildVariationFrames(fact.fenBefore, candidate.principalVariation).ok,
      )
      .toSorted((a, b) => b.evaluationCp - a.evaluationCp);
    const best = candidates[0];
    if (!best || candidates.length !== fact.candidates.length) continue;
    const moment = analysis.moments.find((m) => m.ply === fact.ply);
    if (
      moment &&
      (moment.gameId !== game.id ||
        moment.analysisVersion !== fact.analysisVersion ||
        moment.candidateMoveUci !== best.uci)
    )
      continue;

    const legalMoves = chess.moves({ verbose: true });
    const move = legalMoves.find(({ lan }) => lan === best.uci);
    if (move === undefined) continue;
    const mates = legalMoves.filter(({ san }) => san.endsWith("#"));
    const missedMate =
      move.san.endsWith("#") &&
      !mates.some(({ lan }) => lan === fact.playedMoveUci);
    if (mates.length && !move.san.endsWith("#")) continue;
    const matched = mates.length
      ? mates.some((m) => m.lan === fact.playedMoveUci)
      : candidates.some(
          (c) =>
            c.uci === fact.playedMoveUci &&
            best.evaluationCp - c.evaluationCp <= REVIEW_MOVE_TOLERANCE_CP,
        );
    if (
      legalMoves.length < 2 ||
      (!matched && !missedMate && fact.impactCp <= REVIEW_MOVE_TOLERANCE_CP)
    )
      continue;
    seen.add(fact.ply);
    const theme = move.san.endsWith("#") ? "one-move-threat" : fact.theme;
    const moveLabel = `Move ${String(chess.moveNumber())}`;
    const followUps = transferExercisesForTheme(theme).filter(
      (item) => !sameTransferPosition(item.fen, fact.fenBefore),
    );

    const drill: VerifiedGameDrill = {
      exercise: {
        id: moment?.id ?? [game.id, fact.ply, fact.theme].join(":"),
        theme,
        fen: fact.fenBefore,
        acceptableMoves: move.san.endsWith("#")
          ? mates.map(({ lan }) => lan)
          : candidates
              .filter(
                ({ evaluationCp }) =>
                  best.evaluationCp - evaluationCp <= REVIEW_MOVE_TOLERANCE_CP,
              )
              .map(({ uci }) => uci),
        explanation: `In your game you played ${fact.playedMoveSan}. Stockfish’s highest-scoring checked move was ${move.san}.`,
        verification: {
          candidates: move.san.endsWith("#")
            ? [move, ...mates.filter(({ lan }) => lan !== move.lan)].map(
                ({ lan }) => ({
                  uci: lan,
                  evaluationCp: best.evaluationCp,
                }),
              )
            : candidates,
          toleranceCp: move.san.endsWith("#") ? 0 : REVIEW_MOVE_TOLERANCE_CP,
          principalVariation: best.principalVariation,
        },
      },
      moveLabel,
      played: fact.playedMoveSan,
      candidate: move.san,
      phase: fact.phase,
      backRank: false,
      mateInOne: move.san.endsWith("#"),
      completedAt: game.completedAt,
      imported: game.origin.type !== "tutor",
      followUps,
    };
    observations.push({
      game,
      ply: fact.ply,
      impactCp: fact.impactCp,
      outcome: matched ? "matched" : "retry",
      drill,
    });
  }
  return observations;
}
