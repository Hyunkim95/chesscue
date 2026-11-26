import type { LearningTheme } from "../analysis/types";

export type TransferDifficulty = "close" | "unlabeled";

export interface VerifiedTransferCandidate {
  readonly uci: string;
  readonly evaluationCp: number;
}

export interface TransferVerification {
  readonly engine: string;
  readonly moveTimeMs: number;
  readonly multiPv: number;
  readonly verifiedAt: string;
  readonly toleranceCp: number;
  readonly bestMoveUci: string;
  readonly principalVariation: readonly string[];
  readonly candidates: readonly VerifiedTransferCandidate[];
}

export interface VerifiedTransferExercise {
  readonly schemaVersion: number;
  readonly id: string;
  readonly version: string;
  readonly theme: LearningTheme;
  readonly difficulty: TransferDifficulty;
  readonly fen: string;
  readonly acceptableMoves: readonly string[];
  readonly prompt: string;
  readonly explanation: string;
  readonly provenance: string;
  readonly source: {
    readonly url: string;
    readonly sourceHash: string;
    readonly ply: number;
  };
  readonly authorship: {
    readonly model: string;
    readonly route: "on-device" | "cloud";
    readonly runId: string;
    readonly promptVersion: string;
    readonly promptHash: string;
    readonly responseHash: string;
  };
  readonly verification: TransferVerification;
}

export type PracticeExercise = Pick<
  VerifiedTransferExercise,
  "id" | "theme" | "fen" | "acceptableMoves" | "explanation"
> & {
  readonly prompt?: string;
  readonly authorship?: VerifiedTransferExercise["authorship"];
  readonly source?: VerifiedTransferExercise["source"];
  readonly verification: Pick<
    TransferVerification,
    "candidates" | "toleranceCp" | "principalVariation"
  >;
};

export type TransferExerciseValidation =
  | { readonly ok: true; readonly exercise: VerifiedTransferExercise }
  | { readonly ok: false; readonly reason: string };
