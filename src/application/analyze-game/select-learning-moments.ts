import type {
  LearningMoment,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import { validateMoveAnalysisFact } from "../../domain/analysis/validate-fact";

export interface SelectLearningMomentsResult {
  readonly moments: readonly LearningMoment[];
  readonly rejectedFacts: readonly {
    readonly index: number;
    readonly reason: string;
  }[];
}

function compareFacts(left: MoveAnalysisFact, right: MoveAnalysisFact): number {
  if (left.impactCp !== right.impactCp) return right.impactCp - left.impactCp;
  if (left.recurrence !== right.recurrence)
    return right.recurrence - left.recurrence;
  if (left.curricularRelevance !== right.curricularRelevance) {
    return right.curricularRelevance - left.curricularRelevance;
  }
  if (left.ply !== right.ply) return left.ply - right.ply;
  return left.theme.localeCompare(right.theme);
}

function toMoment(fact: MoveAnalysisFact): LearningMoment {
  const candidate = fact.candidates[0];
  if (candidate === undefined) {
    throw new Error("Validated analysis fact must contain a candidate move");
  }

  return {
    id: `${fact.gameId}:${String(fact.ply)}:${fact.theme}`,
    gameId: fact.gameId,
    ply: fact.ply,
    fenBefore: fact.fenBefore,
    playedMoveUci: fact.playedMoveUci,
    playedMoveSan: fact.playedMoveSan,
    candidateMoveUci: candidate.uci,
    ...(candidate.san === undefined ? {} : { candidateMoveSan: candidate.san }),
    impactCp: fact.impactCp,
    theme: fact.theme,
    phase: fact.phase,
    analysisVersion: fact.analysisVersion,
    trace: {
      evaluationBeforeCp: fact.evaluationBeforeCp,
      evaluationAfterCp: fact.evaluationAfterCp,
      recurrence: fact.recurrence,
      curricularRelevance: fact.curricularRelevance,
    },
  };
}

export function selectLearningMoments(
  inputs: readonly unknown[],
  limit = 3,
): SelectLearningMomentsResult {
  const facts: MoveAnalysisFact[] = [];
  const rejectedFacts: { index: number; reason: string }[] = [];

  inputs.forEach((input, index) => {
    const result = validateMoveAnalysisFact(input);
    if (result.ok) facts.push(result.fact);
    else rejectedFacts.push({ index, reason: result.reason });
  });

  const selected: MoveAnalysisFact[] = [];
  const selectedThemes = new Set<string>();
  const boundedLimit = Math.max(0, Math.min(3, limit));

  for (const fact of facts.sort(compareFacts)) {
    if (selected.length >= boundedLimit) break;
    if (selectedThemes.has(fact.theme)) continue;
    selected.push(fact);
    selectedThemes.add(fact.theme);
  }

  return { moments: selected.map(toMoment), rejectedFacts };
}
