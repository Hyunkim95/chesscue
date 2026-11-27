// Scores the opening book against Lichess's own labels. Every Lichess game
// export carries an Opening header that Lichess computed independently, so it
// is a label our code did not produce. Reads a PGN file, runs trackOpening on
// each standard-start game and prints exact-name, ECO and family agreement,
// with each disagreement sorted by cause.
// Usage: node scripts/openings/benchmark-openings.mjs <games.pgn>
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { Chess } from "chess.js";
import { createServer } from "vite";

const [path] = process.argv.slice(2);
if (!path) throw new Error("Usage: benchmark-openings.mjs <games.pgn>");

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { parseOpeningBook, positionKey, trackOpening } =
  await server.ssrLoadModule("/src/domain/openings/opening-book.ts");
const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../src/domain/openings/openings.generated.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book = parsed.value;
const bookNames = new Set(book.openings.map(({ name }) => name));

const family = (name) => name.split(":")[0];
const games = readFileSync(path, "utf8").split(/\n(?=\[Event )/);
const counts = {
  games: 0,
  skipped: 0,
  exact: 0,
  eco: 0,
  family: 0,
  causes: {},
};
const examples = {};

for (const text of games) {
  const header = (tag) =>
    new RegExp(`^\\[${tag} "([^"]*)"\\]`, "m").exec(text)?.[1];
  const label = header("Opening");
  const eco = header("ECO");
  if (!label || header("FEN") || header("Variant") === "Chess960") {
    counts.skipped += 1;
    continue;
  }
  const board = new Chess();
  try {
    board.loadPgn(text);
  } catch {
    counts.skipped += 1;
    continue;
  }
  const moves = board.history({ verbose: true }).map((move) => move.lan);
  const track = trackOpening(book, moves);
  if (!track.ok) {
    counts.skipped += 1;
    continue;
  }
  counts.games += 1;
  const ours = track.value.opening;
  if (ours?.name === label) counts.exact += 1;
  if (ours?.eco === eco) counts.eco += 1;
  if (ours && family(ours.name) === family(label)) counts.family += 1;
  if (ours?.name === label) continue;

  // Why the names differ. Lichess keeps reading after a move leaves the book,
  // so a later transposition back into a named line changes its label.
  const replay = new Chess();
  const later = [];
  for (const uci of moves.slice(0, 40)) {
    replay.move(uci);
    const position = book.positions.get(positionKey(replay.fen()));
    const named = position && book.openings[position.opening];
    if (named) later.push(named.name);
  }
  const cause = !bookNames.has(label)
    ? "label not in our book version"
    : ours === undefined
      ? "we found no named position"
      : later.includes(label)
        ? "Lichess stopped at an earlier name"
        : "other";
  counts.causes[cause] = (counts.causes[cause] ?? 0) + 1;
  const listed = (examples[cause] ??= []);
  if (listed.length < 3)
    listed.push({ ours: ours?.name, lichess: label, site: header("Site") });
}
await server.close();

const pct = (n) => `${((100 * n) / counts.games).toFixed(1)}%`;
console.log(
  JSON.stringify(
    {
      book: book.version,
      games: counts.games,
      skipped: counts.skipped,
      exactName: pct(counts.exact),
      eco: pct(counts.eco),
      family: pct(counts.family),
      disagreements: Object.fromEntries(
        Object.entries(counts.causes).map(([cause, n]) => [
          cause,
          `${String(n)} (${pct(n)})`,
        ]),
      ),
      examples,
    },
    null,
    2,
  ),
);
