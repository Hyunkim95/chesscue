export const curriculumThemes = [
  "hanging-piece",
  "one-move-threat",
  "central-pawn-tension",
  "king-safety",
] as const;

export type CurriculumTheme = (typeof curriculumThemes)[number];
export type EvidenceOrigin = "tutor" | "import";
export type EvidenceOutcome = "success" | "weakness";
export type GamePhase = "opening" | "middlegame" | "endgame";

export interface CurriculumEvidence {
  readonly id: string;
  readonly theme: CurriculumTheme;
  readonly origin: EvidenceOrigin;
  readonly outcome: EvidenceOutcome;
  readonly impact: number;
  readonly confidence: number;
  readonly occurredAt: string;
  readonly phase: GamePhase;
  readonly sourceGameId: string;
}

export interface TutorGameOutcome {
  readonly id: string;
  readonly completedAt: string;
  readonly score: 0 | 0.5 | 1;
}

export interface ThemeMastery {
  readonly theme: CurriculumTheme;
  readonly score: number;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly lastObservedAt: string | null;
  readonly weaknessPriority: number;
  readonly status: "unseen" | "emerging" | "established";
}

export interface StrengthProfile {
  readonly targetElo: number;
  readonly uncertainty: number;
  readonly completedTutorGames: number;
  readonly gamesIntoWindow: number;
}

export interface NextGamePrescription {
  readonly focus: CurriculumTheme;
  readonly targetElo: number;
  readonly mode: "focus" | "consolidation";
  readonly reason: string;
}

export interface PlayerProfile {
  readonly schemaVersion: 1;
  readonly curriculumVersion: string;
  readonly computedAt: string;
  readonly strength: StrengthProfile;
  readonly mastery: Readonly<Record<CurriculumTheme, ThemeMastery>>;
  readonly nextGame: NextGamePrescription;
}

export interface BuildProfileInput {
  readonly initialTargetElo: number;
  readonly curriculumVersion: string;
  readonly computedAt: string;
  readonly evidence: readonly CurriculumEvidence[];
  readonly tutorGames: readonly TutorGameOutcome[];
}
