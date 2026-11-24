import {
  curriculumThemes,
  type BuildProfileInput,
  type CurriculumEvidence,
  type CurriculumTheme,
  type PlayerProfile,
  type ThemeMastery,
  type TutorGameOutcome,
} from "./types";

const MIN_ELO = 400;
const MAX_ELO = 3190;
const WINDOW_SIZE = 3;
const ELO_STEP = 50;
const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 30;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const recencyWeight = (occurredAt: string, computedAt: string): number => {
  const ageDays = Math.max(
    0,
    (timestamp(computedAt) - timestamp(occurredAt)) / DAY_MS,
  );
  return 2 ** (-ageDays / RECENCY_HALF_LIFE_DAYS);
};

const evidenceWeight = (item: CurriculumEvidence, computedAt: string): number =>
  clamp(item.impact, 0, 1) *
  clamp(item.confidence, 0, 1) *
  recencyWeight(item.occurredAt, computedAt);

const buildThemeMastery = (
  theme: CurriculumTheme,
  evidence: readonly CurriculumEvidence[],
  computedAt: string,
): ThemeMastery => {
  const matches = evidence
    .filter((item) => item.theme === theme)
    .toSorted((left, right) => left.id.localeCompare(right.id));

  if (matches.length === 0) {
    return {
      theme,
      score: 0.5,
      confidence: 0,
      evidenceCount: 0,
      lastObservedAt: null,
      weaknessPriority: 0,
      status: "unseen",
    };
  }

  let successWeight = 0;
  let weaknessWeight = 0;
  let impactSum = 0;
  for (const item of matches) {
    const weight = evidenceWeight(item, computedAt);
    impactSum += clamp(item.impact, 0, 1);
    if (item.outcome === "success") successWeight += weight;
    else weaknessWeight += weight;
  }

  const totalWeight = successWeight + weaknessWeight;
  const score = totalWeight === 0 ? 0.5 : successWeight / totalWeight;
  const confidence = clamp(1 - Math.exp(-totalWeight / 2), 0, 1);
  const averageImpact = impactSum / matches.length;
  const recurrence = clamp(
    matches.filter((item) => item.outcome === "weakness").length / 3,
    0,
    1,
  );
  const uncertainty = 1 - confidence;
  const weaknessPriority =
    averageImpact * recurrence * (0.4 + uncertainty * 0.6) * (1 - score);
  const lastObservedAt =
    matches
      .map((item) => item.occurredAt)
      .toSorted((left, right) => timestamp(right) - timestamp(left))[0] ?? null;

  return {
    theme,
    score,
    confidence,
    evidenceCount: matches.length,
    lastObservedAt,
    weaknessPriority,
    status:
      matches.length < 3 || confidence < 0.65 ? "emerging" : "established",
  };
};

const calculateTargetElo = (
  initialTargetElo: number,
  tutorGames: readonly TutorGameOutcome[],
): number => {
  const ordered = tutorGames.toSorted((left, right) => {
    const timeDifference =
      timestamp(left.completedAt) - timestamp(right.completedAt);
    return timeDifference === 0
      ? left.id.localeCompare(right.id)
      : timeDifference;
  });

  let targetElo = clamp(Math.round(initialTargetElo), MIN_ELO, MAX_ELO);
  const completeWindowCount = Math.floor(ordered.length / WINDOW_SIZE);
  for (
    let windowIndex = 0;
    windowIndex < completeWindowCount;
    windowIndex += 1
  ) {
    const start = windowIndex * WINDOW_SIZE;
    const window = ordered.slice(start, start + WINDOW_SIZE);
    const averageScore =
      window.reduce((sum, game) => sum + game.score, 0) / WINDOW_SIZE;
    if (averageScore > 0.55) targetElo += ELO_STEP;
    else if (averageScore < 0.45) targetElo -= ELO_STEP;
    targetElo = clamp(targetElo, MIN_ELO, MAX_ELO);
  }
  return targetElo;
};

export const buildPlayerProfile = (input: BuildProfileInput): PlayerProfile => {
  const masteryEntries = curriculumThemes.map(
    (theme) =>
      [
        theme,
        buildThemeMastery(theme, input.evidence, input.computedAt),
      ] as const,
  );
  const mastery = Object.fromEntries(masteryEntries) as Record<
    CurriculumTheme,
    ThemeMastery
  >;
  const orderedFocus = curriculumThemes.toSorted((left, right) => {
    const difference =
      mastery[right].weaknessPriority - mastery[left].weaknessPriority;
    return difference === 0 ? left.localeCompare(right) : difference;
  });
  const focus = orderedFocus[0] ?? curriculumThemes[0];
  const targetElo = calculateTargetElo(
    input.initialTargetElo,
    input.tutorGames,
  );
  const completedTutorGames = input.tutorGames.length;
  const mode =
    Math.floor(completedTutorGames / WINDOW_SIZE) % 2 === 1
      ? "consolidation"
      : "focus";

  return {
    schemaVersion: 1,
    curriculumVersion: input.curriculumVersion,
    computedAt: input.computedAt,
    strength: {
      targetElo,
      uncertainty: clamp(1 - completedTutorGames / 12, 0.1, 1),
      completedTutorGames,
      gamesIntoWindow: completedTutorGames % WINDOW_SIZE,
    },
    mastery,
    nextGame: {
      focus,
      targetElo,
      mode,
      reason:
        mastery[focus].status === "unseen"
          ? `Build baseline evidence for ${focus}.`
          : `Reinforce ${focus} from ${String(mastery[focus].evidenceCount)} recent observations.`,
    },
  };
};
