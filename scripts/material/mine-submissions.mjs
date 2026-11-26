import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { parsePgnBatch } from "../../src/domain/import/pgn-parser.ts";
import { openEngine } from "./engine.mjs";
import { firestore, verify } from "./sync-library.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const motif = "Mate in one";
const motifId = hash(motif.toLowerCase());
const question = "Which move would you play here?";
const template = "submitted-mate-in-one-v1";

async function analyze(game, sourceId, project, db, engine) {
  const opportunities = [];
  let puzzleId = null;
  for (const move of game.moves) {
    const board = new Chess(move.fenBefore);
    const mates = board.moves().filter((san) => san.endsWith("#"));
    if (!mates.length) continue;
    opportunities.push({
      ply: move.ply,
      side: board.turn(),
      played: move.uci,
      outcome: mates.includes(move.san) ? "found" : "missed",
    });
    // A single forced answer gives the first mining pass an unambiguous teaching target.
    if (puzzleId || mates.length !== 1) continue;
    const answer = board.move(mates[0]).lan;
    const solution = [answer];
    const verification = await verify(engine, {
      fen: move.fenBefore,
      solution,
    });
    if (!verification || verification.bestMoveUci !== answer) continue;
    const id = hash(
      JSON.stringify([move.fenBefore.split(" ").slice(0, 4), solution]),
    );
    const explanation = mates[0] + " checkmates the opposing king in one move.";
    const source = {
      submittedGameId: sourceId,
      sourceHash: sourceId,
      ply: move.ply,
      game:
        "https://" +
        project +
        ".web.app/?sharedGame=" +
        sourceId +
        "&ply=" +
        String(move.ply - 1),
    };
    await db.create("puzzleMotifs", motifId, {
      schemaVersion: 1,
      id: motifId,
      version: 1,
      name: motif,
    });
    await db.create("puzzleLibrary", id, {
      schemaVersion: 1,
      id,
      motifId,
      motifVersion: 1,
      fen: move.fenBefore,
      acceptableMoves: solution,
      solution,
      rating: null,
      question,
      explanation,
      source,
      verification,
      authorship: {
        model: "ChessCue mate-in-one template",
        route: "cloud",
        runId: randomUUID(),
        promptVersion: template,
        promptHash: hash(template),
        responseHash: hash(JSON.stringify([question, explanation])),
      },
    });
    puzzleId = id;
  }
  return { schemaVersion: 1, sourceId, opportunities, puzzleId };
}

export async function mineSubmissions(project, token) {
  const db = firestore(project, token);
  const docs = await db.listSubmissions();
  if (!docs.length) return;
  const engine = await openEngine();
  try {
    for (const doc of docs) {
      const sourceId = doc.name.split("/").at(-1);
      const pgn = doc.fields?.pgn?.stringValue;
      const parsed =
        typeof pgn === "string" && hash(pgn) === sourceId && parsePgnBatch(pgn);
      const item = parsed?.ok && parsed.items.length === 1 && parsed.items[0];
      if (item?.status === "parsed") {
        const { game } = item;
        const gameKey = hash(
          JSON.stringify([game.initialFen, game.moves.map((m) => m.uci)]),
        );
        await db.create("sharedGames", sourceId, {
          schemaVersion: 1,
          pgn,
          gameKey,
        });
        // Annotated editions retain their own source, but count the played game only once.
        if (!(await db.get("submittedMateEvidence", gameKey))) {
          const evidence = await analyze(game, sourceId, project, db, engine);
          await db.create("submittedMateEvidence", gameKey, evidence);
        }
      }
      // Only acknowledge after all derived records exist. Failed writes are retried next run.
      await db.removeSubmission(sourceId);
    }
  } finally {
    engine.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const project = process.env.LIBRARY_FIREBASE_PROJECT;
  const token = process.env.LIBRARY_FIRESTORE_TOKEN;
  if (!project || !token)
    throw Error("Missing Firestore publisher configuration");
  await mineSubmissions(project, token);
}
