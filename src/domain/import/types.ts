import type { GameRecord } from "../game/types";

export type PgnImportSource =
  | { readonly type: "paste" }
  | { readonly type: "upload"; readonly fileName: string };

export type PgnImportIssueCode =
  | "empty-input"
  | "input-too-large"
  | "too-many-games"
  | "malformed-pgn"
  | "unsupported-variant"
  | "incomplete-game"
  | "duplicate-game";

export interface PgnImportIssue {
  readonly code: PgnImportIssueCode;
  readonly message: string;
}

export interface ParsedPgnMove {
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

export interface ParsedPgnGame {
  readonly index: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly initialFen: string;
  readonly originalPgn: string;
  readonly canonicalPgn: string;
  readonly result: "white-win" | "black-win" | "draw";
  readonly moves: readonly ParsedPgnMove[];
  readonly fingerprint: string;
}

export type ParsedPgnItem =
  | { readonly status: "parsed"; readonly game: ParsedPgnGame }
  | {
      readonly status: "rejected";
      readonly index: number;
      readonly issue: PgnImportIssue;
    };

export type PgnBatchParseResult =
  | { readonly ok: true; readonly items: readonly ParsedPgnItem[] }
  | { readonly ok: false; readonly issue: PgnImportIssue };

export interface ImportedGame {
  readonly originalPgn: string;
  readonly record: GameRecord;
  readonly headers: Readonly<Record<string, string>>;
}

export type ImportGameItemResult =
  | {
      readonly status: "accepted";
      readonly index: number;
      readonly game: ImportedGame;
    }
  | {
      readonly status: "duplicate";
      readonly originalPgn: string;
      readonly index: number;
      readonly fingerprint: string;
      readonly issue: PgnImportIssue;
    }
  | {
      readonly status: "rejected";
      readonly index: number;
      readonly issue: PgnImportIssue;
    };

export interface ImportGamesResult {
  readonly items: readonly ImportGameItemResult[];
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
}
