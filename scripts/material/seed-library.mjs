import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, writeFile, rename } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { openEngine } from "./engine.mjs";
import { parseRow, replaySourceGame, verify } from "./sync-library.mjs";

const [csvFile, output, priorFile] = process.argv.slice(2);
if (!csvFile || !output)
  throw Error(
    "Usage: node scripts/material/seed-library.mjs puzzles.csv seed.generated.json [prior-seed.generated.json]",
  );
const key = process.env.GEMINI_API_KEY;
const profile = process.env.CHESSCUE_NANO_PROFILE;
if (!key && !profile)
  throw Error("Set GEMINI_API_KEY or CHESSCUE_NANO_PROFILE");
const route = key ? "cloud" : "on-device";
const model = key
  ? process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
  : "Gemini Nano";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const runId = randomUUID();
const promptVersion = "lichess-curriculum-seed-v1";
const dataset = "https://database.lichess.org/#puzzles";
const size = 6;
const maxCurricula = 4;
const csv = await readFile(csvFile, "utf8");
// Ignore tags that describe dataset buckets. Chess motifs are discovered from the export.
const bucket =
  /^(?:opening|middlegame|endgame|short|long|veryLong|oneMove|crushing|advantage|equality|master|masterVsMaster|superGM|mix|mate|mateIn\d+)$/;
const prior = priorFile ? JSON.parse(await readFile(priorFile, "utf8")) : null;
const priorTags = new Set(prior?.motifs.flatMap((motif) => motif.source.tags));
const priorMotifs = new Set(prior?.motifs.map((motif) => motif.id));
const byTag = new Map();
const bands = [
  [850, 1300],
  [1300, 1700],
  [1700, 2150],
];
for (const row of csv.trim().split(/\r?\n/).slice(1)) {
  const fields = row.split(",");
  const rating = Number(fields[3]),
    deviation = Number(fields[4]),
    popularity = Number(fields[5]),
    plays = Number(fields[6]);
  if (
    !bands.some(([lo, hi]) => rating >= lo && rating < hi) ||
    deviation > 85 ||
    popularity < 85 ||
    plays < 1000
  )
    continue;
  for (const tag of (fields[7] ?? "").split(" ")) {
    if (!tag || bucket.test(tag) || priorTags.has(tag)) continue;
    const rows = byTag.get(tag) ?? [];
    rows.push({ row, rating, popularity, plays });
    byTag.set(tag, rows);
  }
}
const ranked = [...byTag].sort((a, b) => b[1].length - a[1].length);
const copySchema = z
  .object({
    motif: z
      .string()
      .trim()
      .min(3)
      .max(65)
      .regex(/^[\p{L}][\p{L} '\u2019-]+$/u),
    title: z.string().trim().min(3).max(90),
    goal: z.string().trim().min(8).max(200),
    question: z
      .string()
      .trim()
      .min(8)
      .max(180)
      .regex(/^[^!?<>\d\n]+\?$/),
  })
  .strict();
const jsonSchema = {
  type: "object",
  properties: {
    motif: { type: "string" },
    title: { type: "string" },
    goal: { type: "string" },
    question: { type: "string" },
  },
  required: ["motif", "title", "goal", "question"],
};
let server, browser, page;
async function author(tag, items) {
  const prompt = JSON.stringify({
    task: "Create a short curriculum for practising the Lichess source theme. Name that motif in plain English. Write a short title, a goal describing what to practise and one learner reflection question that works across the given puzzles. The question should be usable before solving, with no answer, no notation and no assumptions about the board.",
    sourceTheme: tag,
    items: items.map((item) => ({
      id: item.id,
      rating: item.rating,
      source: item.source.game,
      tags: item.source.tags,
      checkedLine: item.solution,
    })),
  });
  let raw;
  if (key) {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
          },
        }),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!res.ok) throw Error("Gemini Cloud returned HTTP " + res.status);
    const data = await res.json();
    raw = data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text)
      .join("");
  } else {
    raw = await page.evaluate(
      async ({ prompt, jsonSchema }) => {
        const session = await LanguageModel.create({
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          signal: AbortSignal.timeout(120000),
        });
        try {
          return await session.prompt(prompt, {
            responseConstraint: jsonSchema,
            signal: AbortSignal.timeout(120000),
          });
        } finally {
          session.destroy();
        }
      },
      { prompt, jsonSchema },
    );
  }
  const copy = copySchema.parse(JSON.parse(raw));
  return {
    copy,
    authorship: {
      model,
      route,
      runId,
      promptVersion,
      promptHash: sha(prompt),
      responseHash: sha(raw),
    },
  };
}
const fixture = {
  schemaVersion: 1,
  runId,
  generatedAt: new Date().toISOString(),
  input: {
    dataset,
    sha256: sha(csv),
    rows: csv.trim().split(/\r?\n/).length - 1,
  },
  motifs: [],
  puzzles: [],
  curricula: [],
};
const used = new Set(prior?.puzzles.map((puzzle) => puzzle.id));
let engine;
try {
  if (!key) {
    server = createServer((_, res) =>
      res.end("<button>Generate starter library</button>"),
    ).listen(0, "127.0.0.1");
    await once(server, "listening");
    browser = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: false,
      args:
        process.env.CHESSCUE_NANO_DEV === "1"
          ? [
              "--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel",
              "--disable-features=OptimizationGuideModelExecutionPerformanceClass,OptimizationGuideOnDeviceModelBackgroundDownload",
            ]
          : [],
    });
    page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.waitForFunction(
      async () =>
        typeof LanguageModel !== "undefined" &&
        (await LanguageModel.availability({
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        })) === "available",
      null,
      { timeout: 45000 },
    );
    await page.getByRole("button").click();
  }
  engine = await openEngine();
  for (const [tag, rows] of ranked) {
    if (fixture.curricula.length >= maxCurricula) break;
    const items = [];
    const seen = new Set();
    for (const [lo, hi] of bands) {
      let matched = 0;
      const candidates = rows
        .filter((row) => row.rating >= lo && row.rating < hi)
        .sort((a, b) => b.popularity - a.popularity || b.plays - a.plays)
        .slice(0, 12);
      for (const { row } of candidates) {
        const record = parseRow(row);
        if (!record) continue;
        const answers = (
          record.legalMates.length ? record.legalMates : [record.solution[0]]
        ).toSorted();
        const id = sha(
          JSON.stringify([record.fen.split(" ").slice(0, 4), answers]),
        );
        if (used.has(id) || seen.has(id)) continue;
        const engineProof = await verify(engine, record);
        if (!engineProof) continue;
        const game = await replaySourceGame(record);
        if (!game) continue;
        items.push({
          schemaVersion: 1,
          id,
          fen: record.fen,
          acceptableMoves: answers,
          solution: record.solution,
          rating: record.rating,
          ratingDeviation: record.deviation,
          explanation:
            "The checked solution begins with " + record.san[0] + ".",
          source: {
            dataset,
            game: record.url,
            lichessId: record.id,
            sourceHash: record.sourceHash,
            pgnHash: game.pgnHash,
            ply: game.ply,
            tags: record.tags,
          },
          verification: engineProof,
        });
        seen.add(id);
        if (++matched === 2) break;
      }
    }
    if (items.length !== size) continue;
    console.log("Verified source group", tag);
    let content;
    for (let i = 0; i < 3 && !content; i++) {
      try {
        content = await author(tag, items);
      } catch (error) {
        if (page?.isClosed()) throw error;
        console.log(
          "Curriculum generation attempt failed for",
          tag,
          error instanceof Error ? error.message : "",
        );
      }
    }
    if (!content) continue;
    const { copy, authorship } = content;
    const motifId = sha(copy.motif.toLowerCase().replace(/\s+/g, " "));
    if (
      priorMotifs.has(motifId) ||
      fixture.motifs.some((m) => m.id === motifId)
    )
      continue;
    fixture.motifs.push({
      schemaVersion: 1,
      id: motifId,
      name: copy.motif,
      version: 1,
      source: { dataset, game: items[0].source.game, tags: [tag] },
      authorship,
    });
    for (const item of items) {
      fixture.puzzles.push({
        ...item,
        motifId,
        motifVersion: 1,
        question: copy.question,
        authorship,
      });
      used.add(item.id);
    }
    fixture.curricula.push({
      schemaVersion: 1,
      id: motifId,
      version: 1,
      motifId,
      motifVersion: 1,
      title: copy.title,
      goal: copy.goal,
      puzzleIds: items
        .toSorted((a, b) => a.rating - b.rating)
        .map((item) => item.id),
      authorship,
    });
    console.log("Prepared", tag, size, "puzzles");
  }
  if (fixture.curricula.length !== maxCurricula)
    throw Error("Could not verify and author four complete curricula");
  const temporary = output + "." + runId + ".tmp";
  await writeFile(temporary, JSON.stringify(fixture, null, 2) + "\n");
  await rename(temporary, output);
  console.log(
    JSON.stringify({
      curricula: fixture.curricula.length,
      puzzles: fixture.puzzles.length,
      route,
      model,
    }),
  );
} finally {
  engine?.close();
  await browser?.close();
  server?.close();
}
