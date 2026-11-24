export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type GameId = Brand<string, 'GameId'>;
export type PositionId = Brand<string, 'PositionId'>;

export type PlayerColor = 'white' | 'black';

export type GameOrigin =
  | { readonly type: 'tutor' }
  | { readonly type: 'pgn-upload'; readonly sourceName: string }
  | { readonly type: 'pgn-paste' };

export type GameResult = 'white-win' | 'black-win' | 'draw';

export interface RecordedMove {
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly fenAfter: string;
  readonly playedAt: string;
}

export interface GameRecord {
  readonly schemaVersion: 1;
  readonly id: GameId;
  readonly origin: GameOrigin;
  readonly initialFen: string;
  readonly moves: readonly RecordedMove[];
  readonly pgn: string;
  readonly playerColor: PlayerColor | null;
  readonly result: GameResult | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly curriculumVersion: string;
  readonly configurationVersion: string;
  readonly fingerprint: string | null;
}
