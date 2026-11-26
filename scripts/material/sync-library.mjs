import { URL, pathToFileURL } from "node:url";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { z } from "zod";
import { openEngine } from "./engine.mjs";

const exportUrl = "https://database.lichess.org/#puzzles";
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const key = process.env.GEMINI_API_KEY;
const project = process.env.LIBRARY_FIREBASE_PROJECT;
const token = process.env.LIBRARY_FIRESTORE_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const verifySources = !dryRun || process.argv.includes("--verify-sources");
const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const limit = 12;
const scanLimit = 350;
const runId = randomUUID();
const draftSchema = z
  .object({
    motif: z.string().trim().min(3).max(80),
    question: z
      .string()
      .trim()
      .min(8)
      .max(180)
      .regex(/^[^!?<>\d\n]+\?$/),
    sourceTags: z.array(z.string()).min(1).max(8),
  })
  .strict();

export function parseRow(row) {
  // These fields precede optional columns and contain no commas in the Lichess export.
  const [id, fen, moves, rating, deviation, popularity, plays, tags, url] =
    row.split(",");
  if (
    !/^[a-zA-Z0-9]{5}$/.test(id ?? "") ||
    !/^https:\/\/lichess\.org\/(?:game\/)?[a-zA-Z0-9]{8}(?:\/(?:white|black))?#\d+$/.test(
      url ?? "",
    )
  )
    return null;
  const line = moves?.split(" ") ?? [];
  if (line.length < 2 || !line.every((move) => uci.test(move))) return null;
  const values = [rating, deviation, popularity, plays].map(Number);
  if (
    values.some((value) => !Number.isSafeInteger(value)) ||
    values[2] < 0 ||
    values[3] < 20 ||
    !tags?.trim()
  )
    return null;
  try {
    const board = new Chess(fen);
    board.move(line[0]);
    const puzzleFen = board.fen();
    const legalMates = board
      .moves({ verbose: true })
      .filter((move) => move.san.endsWith("#"))
      .map((move) => move.lan);
    const san = line.slice(1).map((move) => board.move(move).san);
    return {
      id,
      fen: puzzleFen,
      solution: line.slice(1),
      san,
      legalMates,
      rating: values[0],
      deviation: values[1],
      tags: tags.split(" "),
      url,
      sourceHash: sha(row),
    };
  } catch {
    return null;
  }
}

export function firestore(projectId, accessToken) {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (
    emulator &&
    (!projectId.startsWith("demo-") || !/^127\.0\.0\.1:\d+$/.test(emulator))
  )
    throw Error("Expected a local emulator and demo project");
  const origin = emulator
    ? "http://" + emulator
    : "https://firestore.googleapis.com";
  const base =
    origin +
    "/v1/projects/" +
    encodeURIComponent(projectId) +
    "/databases/(default)/documents";
  async function request(path, method, body) {
    const response = await fetch(base + path, {
      method,
      headers: {
        authorization: "Bearer " + accessToken,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (method === "GET" && response.status === 404) return null;
    if (method === "POST" && response.status === 409) return null;
    if (!response.ok)
      throw Error(
        "Firestore " + method + " failed with HTTP " + response.status,
      );
    return response.json();
  }
  function value(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "number") return { integerValue: String(v) };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
    return { mapValue: { fields: fields(v) } };
  }
  const fields = (object) =>
    Object.fromEntries(
      Object.entries(object).map(([key, v]) => [key, value(v)]),
    );
  return {
    async get(collection, id) {
      return request("/" + collection + "/" + id, "GET");
    },
    async create(collection, id, record) {
      return request("/" + collection + "?documentId=" + id, "POST", {
        fields: fields(record),
      });
    },
    async listSubmissions() {
      const page = await request("/pgnSubmissions?pageSize=25", "GET");
      return page?.documents ?? [];
    },
    async removeSubmission(id) {
      await request("/pgnSubmissions/" + id, "DELETE");
    },
    async saveCursor(offset) {
      await request("/librarySync/lichess", "PATCH", {
        fields: fields({ offset }),
      });
    },
  };
}

export async function replaySourceGame(record) {
  const gameId = new URL(record.url).pathname
    .split("/")
    .filter(Boolean)
    .find((segment) => /^[a-zA-Z0-9]{8}$/.test(segment));
  if (!gameId) return null;
  const response = await fetch(
    "https://lichess.org/game/export/" + gameId + "?clocks=false&evals=false",
    {
      headers: { accept: "application/x-chess-pgn" },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok)
    throw Error("Lichess source lookup failed with HTTP " + response.status);
  const pgn = await response.text();
  try {
    const board = new Chess();
    board.loadPgn(pgn);
    const moves = board.history({ verbose: true });
    const ply = Number(new URL(record.url).hash.slice(1));
    const position = moves[ply - 1]?.after;
    if (
      position?.split(" ").slice(0, 4).join(" ") !==
      record.fen.split(" ").slice(0, 4).join(" ")
    )
      return null;
    return { pgnHash: sha(pgn), ply, played: moves[ply]?.san ?? "" };
  } catch {
    return null;
  }
}

async function generate(record, checked, sourceGame) {
  const prompt = JSON.stringify({
    task: "Find the specific chess motif in this verified position. Use the Lichess game record and export tags as source evidence, not as a fixed list of allowed motifs. Return a short motif name, an open question about the learner’s reasoning without specific chess claims or answers, and sourceTags copied verbatim from the record. Do not invent moves, board facts, or sources.",
    source: {
      game: record.url,
      dataset: exportUrl,
      tags: record.tags,
      recordedMove: sourceGame.played,
      ply: sourceGame.ply,
    },
    position: record.fen,
    recordedLine: record.san,
    stockfish: checked,
  });
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!response.ok)
    throw Error("Gemini generation failed with HTTP " + response.status);
  const output = await response.json();
  const raw = output.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text)
    .join("");
  let draft;
  try {
    draft = draftSchema.safeParse(JSON.parse(raw ?? ""));
  } catch {
    return null;
  }
  if (
    !draft.success ||
    !draft.data.sourceTags.every((tag) => record.tags.includes(tag)) ||
    !/^[\p{L}][\p{L} '-]+$/u.test(draft.data.motif)
  )
    return null;
  return {
    draft: draft.data,
    authorship: {
      model,
      route: "cloud",
      runId,
      promptVersion: "lichess-library-v1",
      promptHash: sha(prompt),
      responseHash: sha(raw),
    },
  };
}

export async function verify(engine, record) {
  const board = new Chess(record.fen);
  // Check every recorded solver move, including deeper choices after the recorded reply.
  let verification;
  const checkedSteps = [];
  for (const [index, move] of record.solution.entries()) {
    if (index % 2 === 0) {
      const candidates = await engine.search(board.fen());
      const best = candidates[0];
      if (!best) return null;
      const legalMates = board
        .moves({ verbose: true })
        .filter((m) => m.san.endsWith("#"))
        .map((m) => m.lan);
      if (
        legalMates.length
          ? !legalMates.includes(move)
          : !candidates.some(
              (c) => c.uci === move && best.evaluationCp - c.evaluationCp <= 35,
            )
      )
        return null;
      checkedSteps.push({
        ply: index + 1,
        fen: board.fen(),
        played: move,
        candidates,
      });
      verification ??= {
        engine: "Stockfish 19 Lite WASM",
        moveTimeMs: 700,
        multiPv: 3,
        verifiedAt: new Date().toISOString().slice(0, 10),
        bestMoveUci: best.uci,
        principalVariation: best.principalVariation,
        candidates,
      };
    }
    board.move(move);
  }
  return verification && { ...verification, checkedSteps };
}

async function syncLibrary() {
  if (!dryRun && (!key || !project || !token))
    throw Error(
      "Set GEMINI_API_KEY, LIBRARY_FIREBASE_PROJECT and LIBRARY_FIRESTORE_TOKEN to publish",
    );
  const db = dryRun ? null : firestore(project, token);
  const cursor = await db?.get("librarySync", "lichess");
  const offset = Number(cursor?.fields?.offset?.integerValue ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw Error("Invalid sync cursor");
  const engine = await openEngine();
  const input = csvPath
    ? createReadStream(csvPath, { encoding: "utf8" })
    : process.stdin;
  const lines = createInterface({ input, crlfDelay: Infinity });
  let matchedSources = 0;
  let read = -1,
    scanned = 0,
    published = 0,
    verified = 0;
  try {
    for await (const row of lines) {
      if (++read === 0) {
        if (
          !row.startsWith(
            "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,",
          )
        )
          throw Error("Unexpected Lichess CSV header");
        continue;
      }
      if (read <= offset) continue;
      scanned++;
      const record = parseRow(row);
      if (record) {
        const answers = (
          record.legalMates.length ? record.legalMates : [record.solution[0]]
        ).toSorted();
        const id = sha(
          JSON.stringify([record.fen.split(" ").slice(0, 4), answers]),
        );
        if (!(await db?.get("puzzleLibrary", id))) {
          const verification = await verify(engine, record);
          if (verification) {
            verified++;
            const sourceGame = verifySources
              ? await replaySourceGame(record)
              : null;
            if (sourceGame) matchedSources++;
            if (db) {
              const content =
                sourceGame &&
                (await generate(record, verification, sourceGame));
              if (content && sourceGame) {
                const motifId = sha(
                  content.draft.motif.toLowerCase().replace(/\s+/g, " "),
                );
                const { draft, authorship } = content;
                await db.create("puzzleMotifs", motifId, {
                  schemaVersion: 1,
                  name: draft.motif,
                  version: 1,
                  source: {
                    dataset: exportUrl,
                    game: record.url,
                    tags: draft.sourceTags,
                  },
                  authorship,
                });
                const inserted = await db.create("puzzleLibrary", id, {
                  schemaVersion: 1,
                  id,
                  motifId,
                  motifVersion: 1,
                  fen: record.fen,
                  acceptableMoves: answers,
                  solution: record.solution,
                  rating: record.rating,
                  ratingDeviation: record.deviation,
                  question: draft.question,
                  explanation:
                    "The checked solution begins with " + record.san[0] + ".",
                  source: {
                    dataset: exportUrl,
                    game: record.url,
                    lichessId: record.id,
                    sourceHash: record.sourceHash,
                    pgnHash: sourceGame.pgnHash,
                    ply: sourceGame.ply,
                    tags: draft.sourceTags,
                  },
                  verification,
                  authorship,
                });
                if (inserted) published++;
              }
            }
          }
        }
      }
      if (scanned >= scanLimit || verified >= limit) break;
    }
    if (read < 0) throw Error("Lichess export was empty");
    if (db) await db.saveCursor(scanned ? offset + scanned : 0);
    console.log(
      JSON.stringify({
        dryRun,
        offset,
        scanned,
        verified,
        matchedSources,
        published,
      }),
    );
  } finally {
    lines.close();
    input.destroy();
    engine.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await syncLibrary();
