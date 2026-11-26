import { Chess, DEFAULT_POSITION } from "chess.js";

import { fingerprintCanonicalGame } from "./fingerprint.ts";
import type {
  ParsedPgnGame,
  ParsedPgnItem,
  PgnBatchParseResult,
  PgnImportIssue,
} from "./types";

export interface PgnParseLimits {
  readonly maxBytes: number;
  readonly maxGames: number;
  readonly maxPlies: number;
}

export const DEFAULT_PGN_LIMITS: PgnParseLimits = {
  maxBytes: 1_000_000,
  maxGames: 100,
  maxPlies: 600,
};

const COMPLETE_RESULTS = new Set(["1-0", "0-1", "1/2-1/2"]);
const STANDARD_VARIANTS = new Set(["standard", "chess", "from position"]);

function issue(code: PgnImportIssue["code"], message: string): PgnImportIssue {
  return { code, message };
}

function splitPgnGames(text: string): readonly string[] {
  const games: string[] = [];
  let start = 0;
  let inComment = false;
  let hasMoves = false;
  let hasEvent = false;

  // Slice the source itself so line endings, annotations and variations survive import.
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const value = line[0].trim();
    const tag = !inComment && /^\[(\w+)\s+"/.exec(value);
    if (tag) {
      if (hasMoves || (hasEvent && tag[1] === "Event")) {
        games.push(text.slice(start, line.index).trim());
        start = line.index;
        hasEvent = false;
        hasMoves = false;
      }
      if (tag[1] === "Event") hasEvent = true;
      continue;
    }
    if (!value || value.startsWith("%")) continue;
    hasMoves = true;
    for (const char of value) {
      if (!inComment && char === ";") break;
      if (char === "{") inComment = true;
      if (char === "}") inComment = false;
    }
  }
  const lastGame = text.slice(start).trim();
  if (lastGame) games.push(lastGame);
  return games;
}

function sanitizeHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const stripControlCharacters = (
    value: string,
    replacement: string,
  ): string => {
    let result = "";
    for (const character of value) {
      const code = character.charCodeAt(0);
      result += code <= 31 || code === 127 ? replacement : character;
    }
    return result;
  };

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      stripControlCharacters(key, "").slice(0, 64),
      stripControlCharacters(value, " ").trim().slice(0, 256),
    ]),
  );
}

function mapResult(result: string): ParsedPgnGame["result"] {
  if (result === "1-0") return "white-win";
  if (result === "0-1") return "black-win";
  return "draw";
}

function parseOne(
  pgn: string,
  index: number,
  limits: PgnParseLimits,
): ParsedPgnItem {
  const chess = new Chess();

  try {
    // Lichess can export consecutive comments after a move. chess.js accepts
    // them as one block. Keep quoted tags and line comments intact.
    const normalizedPgn = pgn.replace(
      /"(?:\\.|[^"\\])*"|;[^\r\n]*|\{[^{}]*\}(?:\s*\{[^{}]*\})*/g,
      (token) =>
        token.startsWith("{") ? token.replaceAll(/\}\s*\{/g, " ") : token,
    );
    chess.loadPgn(normalizedPgn, { strict: false });
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "The PGN could not be parsed.";
    return {
      status: "rejected",
      index,
      issue: issue(
        "malformed-pgn",
        `Game ${String(index + 1)} is not legal PGN: ${detail}`,
      ),
    };
  }

  const headers = sanitizeHeaders(chess.getHeaders());
  const variant = headers.Variant?.toLowerCase();
  if (variant !== undefined && !STANDARD_VARIANTS.has(variant)) {
    return {
      status: "rejected",
      index,
      issue: issue(
        "unsupported-variant",
        `Game ${String(index + 1)} uses the unsupported variant "${headers.Variant ?? "unknown"}".`,
      ),
    };
  }

  const result = headers.Result ?? "*";
  if (!COMPLETE_RESULTS.has(result)) {
    return {
      status: "rejected",
      index,
      issue: issue(
        "incomplete-game",
        `Game ${String(index + 1)} must have a completed result.`,
      ),
    };
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    return {
      status: "rejected",
      index,
      issue: issue(
        "malformed-pgn",
        `Game ${String(index + 1)} contains no legal moves.`,
      ),
    };
  }

  if (history.length > limits.maxPlies) {
    return {
      status: "rejected",
      index,
      issue: issue(
        "input-too-large",
        `Game ${String(index + 1)} has ${String(history.length)} plies; the limit is ${String(limits.maxPlies)}.`,
      ),
    };
  }

  const moves = history.map((move, moveIndex) => ({
    ply: moveIndex + 1,
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fenBefore: move.before,
    fenAfter: move.after,
  }));
  const initialFen = moves[0]?.fenBefore ?? DEFAULT_POSITION;
  const fingerprint = fingerprintCanonicalGame(
    initialFen,
    moves.map((move) => move.uci),
  );

  return {
    status: "parsed",
    game: {
      index,
      headers,
      initialFen,
      originalPgn: pgn,
      canonicalPgn: chess.pgn({ maxWidth: 0, newline: "\n" }),
      result: mapResult(result),
      moves,
      fingerprint,
    },
  };
}

export function parsePgnBatch(
  text: string,
  limits: PgnParseLimits = DEFAULT_PGN_LIMITS,
): PgnBatchParseResult {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes === 0 || text.trim().length === 0) {
    return {
      ok: false,
      issue: issue("empty-input", "Paste PGN text or choose a PGN file."),
    };
  }
  if (bytes > limits.maxBytes) {
    return {
      ok: false,
      issue: issue(
        "input-too-large",
        `The PGN input exceeds the ${String(limits.maxBytes)}-byte limit.`,
      ),
    };
  }

  const games = splitPgnGames(text);
  if (games.length > limits.maxGames) {
    return {
      ok: false,
      issue: issue(
        "too-many-games",
        `The import contains ${String(games.length)} games; the limit is ${String(limits.maxGames)}.`,
      ),
    };
  }

  return {
    ok: true,
    items: games.map((game, index) => parseOne(game, index, limits)),
  };
}
