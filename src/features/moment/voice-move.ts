import { Chess } from "chess.js";

const rankWords = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];

export function voiceNotation(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /\b([a-h])\s+(one|two|three|four|five|six|seven|eight|[1-8])\b/g,
      (_, file: string, rank: string) =>
        file + String(Number(rank) || rankWords.indexOf(rank) + 1),
    );
}

// A spoken move is a direct instruction. Questions, negations and partial
// descriptions stay outside this grammar.
export function voiceMoves(text: string, fen: string) {
  const command = voiceNotation(text)
    .trim()
    .replace(/[.!]+$/, "")
    .replace(/^(?:move|play)\s+/, "");
  const legal = new Chess(fen).moves({ verbose: true });
  const notation = legal.filter(
    ({ lan, san }) =>
      lan === command ||
      san.toLowerCase().replace(/[+#]$/, "") === command.replace(/[+#]$/, ""),
  );
  if (notation.length > 0) return notation;

  const coordinates = /^(?:from )?([a-h][1-8])(?: to | )([a-h][1-8])$/.exec(
    command,
  );
  if (coordinates)
    return legal.filter(
      ({ from, to }) => from === coordinates[1] && to === coordinates[2],
    );

  const piece =
    /^(?:(?:the|my) )?(king|queen|rook|bishop|knight|pawn)(?: on ([a-h][1-8]))?(?: to)? ([a-h][1-8])$/.exec(
      command,
    );
  if (!piece) return [];
  const [, name, origin, destination] = piece;
  const type = name === "knight" ? "n" : name?.[0];
  return legal.filter(
    (move) =>
      move.piece === type &&
      (!origin || move.from === origin) &&
      move.to === destination,
  );
}
