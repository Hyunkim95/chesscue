export type GameSite = "lichess" | "chesscom";

export interface CompletedGameExport {
  readonly id: string;
  readonly pgn: string;
  readonly localOnly?: true;
  readonly players: {
    readonly white: {
      readonly user?:
        | { readonly id: string; readonly name: string }
        | undefined;
    };
    readonly black: {
      readonly user?:
        | { readonly id: string; readonly name: string }
        | undefined;
    };
  };
}

export function externalImportSite(hash: string): GameSite | null {
  if (hash.startsWith("#lichess/")) return "lichess";
  if (hash.startsWith("#chesscom/")) return "chesscom";
  return null;
}

export function chessComGamePath(pathname: string) {
  const [, kind, id] =
    /^\/game\/(live|daily)\/(\d{1,18})\/?$/.exec(pathname) ??
    /^\/(live|daily)\/game\/(\d{1,18})\/?$/.exec(pathname) ??
    [];
  return kind && id ? `/${kind}/${id}` : null;
}

export function isChessComUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{2,30}$/i.test(value);
}
