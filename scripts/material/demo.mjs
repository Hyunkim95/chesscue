// Export the original, unmodified PGN for an exercise in the generated pack.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const [pgnFile, packFile, demoFile] = process.argv.slice(2);
const pack = JSON.parse(await readFile(packFile, "utf8"));
const source = pack.historical.attack[0].source;
const pgn = (await readFile(pgnFile, "utf8"))
  .trim()
  .split(/\r?\n(?=\[Event )/)
  .find(
    (game) =>
      createHash("sha256").update(game).digest("hex") === source.sourceHash,
  );
if (!pgn) throw Error("Source game missing from archive");
await writeFile(demoFile, pgn.trim() + "\n");
