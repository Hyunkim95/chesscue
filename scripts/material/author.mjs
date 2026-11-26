// Supply an isolated Chrome profile with the installed Nano model, or GEMINI_API_KEY
// for a Gemini Developer API project. Never persist keys or substitute example copy.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
const [evidencePath, output] = process.argv.slice(2);
if (!output)
  throw Error(
    "Usage: node scripts/material/author.mjs EVIDENCE.json OUTPUT.json",
  );
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const fields = { question: { type: "string" }, focus: { type: "integer" } };
const schema = {
  type: "object",
  properties: fields,
  required: Object.keys(fields),
};
const runId = randomUUID(),
  promptVersion = "grounded-question-v2";
const digest = (text) => createHash("sha256").update(text).digest("hex");
let browser, server, page;
const model = process.env.GEMINI_API_KEY
  ? (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite")
  : "Gemini Nano";
async function generate(prompt) {
  if (process.env.GEMINI_API_KEY) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) throw Error("Gemini returned HTTP " + response.status);
    const result = await response.json();
    return result.candidates[0].content.parts
      .filter((p) => !p.thought)
      .map((p) => p.text)
      .join("");
  }
  return page.evaluate(
    async ({ prompt, schema }) => {
      const session = await LanguageModel.create({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        signal: AbortSignal.timeout(120000),
      });
      try {
        return await session.prompt(prompt, {
          responseConstraint: schema,
          signal: AbortSignal.timeout(120000),
        });
      } finally {
        session.destroy();
      }
    },
    { prompt, schema },
  );
}
async function author(key, context, facts, neutral = false) {
  const prompt = JSON.stringify({
    task:
      "The learner is looking at the board before making a move. Write one direct, present-tense question they can act on now. Use simple English and address the player as you. Select the index (starting at zero) of the most useful supplied fact to reveal after their attempt. The app displays that fact exactly. Do not assert anything about a board, answer your own question, cite any moves, numbers, or square names, or assume an advantage. Do not mention an answer, suggest a move or reveal the recorded move in the question." +
      (neutral
        ? " This is an unlabeled test: ask a neutral question about the player's choice without tactical clues."
        : ""),
    context: neutral
      ? { activity: "Consider your next choice", mode: "unlabeled" }
      : context,
    facts: neutral
      ? facts.map((_, i) => ({ index: i, type: "checked move metadata" }))
      : facts,
  });
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    const text = await generate(prompt);
    let item;
    last = text;
    try {
      item = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      continue;
    }
    if (
      typeof item.question !== "string" ||
      !/^(?:what|which|how|why|where|when|would|could|can|do|is|are)\b[^\d.?!<>\n]{6,190}\?$/i.test(
        item.question,
      ) ||
      !Number.isInteger(item.focus) ||
      !facts[item.focus]
    )
      continue;
    if (
      /\b(?:did|were|was|had)\b|forced|sacrifice|pawn chain|undefended|weakness|advantage|winning|trapped/i.test(
        item.question,
      )
    )
      continue;
    if (
      neutral &&
      /mate|rook|pawn|king|bishop|knight|queen|check|capture|fork|castle|defend|exchange|develop|attack/i.test(
        item.question,
      )
    )
      continue;
    return {
      title: "Reflection",
      question: item.question,
      insight: facts[item.focus],
      authorship: {
        model,
        route: page ? "on-device" : "cloud",
        runId,
        promptVersion,
        promptHash: digest(prompt),
        responseHash: digest(text),
      },
    };
  }
  throw Error("Unverified model output for " + key + ": " + last);
}
try {
  if (!process.env.GEMINI_API_KEY) {
    if (!process.env.CHESSCUE_NANO_PROFILE)
      throw Error("Provide CHESSCUE_NANO_PROFILE or GEMINI_API_KEY");
    server = createServer((_, r) =>
      r.end('<button type="button">Prepare Gemini Nano</button>'),
    ).listen(0, "127.0.0.1");
    await once(server, "listening");
    browser = await chromium.launchPersistentContext(
      process.env.CHESSCUE_NANO_PROFILE,
      {
        channel: "chrome",
        headless: false,
        args:
          process.env.CHESSCUE_NANO_DEV === "1"
            ? [
                "--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel",
                "--disable-features=OptimizationGuideModelExecutionPerformanceClass,OptimizationGuideOnDeviceModelBackgroundDownload",
              ]
            : [],
      },
    );
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
  const pack = {
    version: 2,
    generatedAt: new Date().toISOString(),
    inputs: { pgnHash: evidence.pgnHash, puzzleSampleHash: evidence.csvHash },
    runId,
    positions: [],
    historical: { rook: [], attack: [] },
    openings: evidence.openings,
    skills: {},
  };
  for (const record of evidence.positions) {
    const facts = [
      "Stockfish’s highest-scoring checked move was " + record.bestSan + ".",
      "The checked line begins with " + record.bestSan + ".",
    ];
    const copy = await author(
      record.id,
      { theme: record.theme, mode: record.difficulty },
      facts,
      record.difficulty === "unlabeled",
    );
    pack.positions.push({
      ...record,
      ...copy,
      title: record.theme.replaceAll("-", " "),
    });
    console.log("Authored", record.id);
  }
  for (const [topic, records] of Object.entries(evidence.historical)) {
    for (const record of records) {
      const facts = [
        "The recorded game continued with " +
          record.continuation.join(", ") +
          ".",
        "The recorded move was " + record.bestSan + ".",
      ];
      const copy = await author(
        record.source.ply,
        {
          topic,
          source: record.source.game,
          activity: "Reconstruct the historical player's move.",
        },
        facts,
      );
      pack.historical[topic].push({
        ...record,
        ...copy,
        title:
          "Move " +
          record.fen.split(" ")[5] +
          " · " +
          (record.fen.split(" ")[1] === "w" ? "White" : "Black") +
          " to play",
      });
      console.log("Authored historical", topic, record.source.ply);
    }
  }
  for (const key of [
    "vision",
    "threats",
    "safety",
    "endgames",
    "backrank",
    "forks",
    "rook",
  ]) {
    const sample =
      key === "rook" || key === "endgames"
        ? pack.historical.rook[0]
        : pack.positions[0];
    pack.skills[key] = await author(
      key,
      {
        skill: key,
        activity:
          "Question introducing this skill, about the player's thinking. Do not assert that the example exhibits this skill.",
      },
      [sample.insight],
    );
  }
  const { createServer: createViteServer } = await import("vite");
  const verifier = await createViteServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const { parseStarterPack } = await verifier.ssrLoadModule(
      "/src/domain/material/validate-pack.ts",
    );
    parseStarterPack(pack);
  } finally {
    await verifier.close();
  }
  await mkdir(dirname(output), { recursive: true });
  const temp = output + "." + runId + ".tmp";
  await writeFile(temp, JSON.stringify(pack, null, 2) + "\n");
  await rename(temp, output);
} finally {
  await browser?.close();
  server?.close();
}
