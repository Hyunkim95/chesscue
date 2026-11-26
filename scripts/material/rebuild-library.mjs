import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { z } from "zod";
import { openEngine } from "./engine.mjs";
import { verify } from "./sync-library.mjs";

export const cloudModel = "gemini-3.5-flash-lite";
const promptVersion = "lichess-curriculum-cloud-v2";
const sha = (value) => createHash("sha256").update(value).digest("hex");

const draftSchema = z
  .object({
    motif: z.string().trim().min(3).max(80),
    title: z.string().trim().min(3).max(90),
    goal: z.string().trim().min(8).max(200),
    exercises: z.array(
      z.object({
        id: z.string(),
        question: z
          .string()
          .trim()
          .transform((text) => (/[\p{L}]$/u.test(text) ? text + "?" : text))
          .pipe(
            z
              .string()
              .min(8)
              .max(110)
              .regex(
                /^(what|which|how|why|where|when|would|could|can|do|is|are)\b[^.!?<>\d\n]+\?$/i,
              ),
          )
          .refine(
            (question) =>
              !/checkmate|forced|winning|losing|sacrifice|undefended|only move|guarantee|blunder/i.test(
                question,
              ),
          ),
      }),
    ),
  })
  .strict();

async function requestDraft(request, positions, generate) {
  let feedback;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = JSON.stringify({ ...request, feedback });
    const raw = await generate(prompt);
    try {
      const draft = draftSchema.parse(JSON.parse(raw));
      const questions = new Map(
        draft.exercises.map(({ id, question }) => [id, question]),
      );
      if (
        draft.exercises.length !== positions.length ||
        questions.size !== positions.length ||
        !positions.every(({ id }) => questions.has(id)) ||
        new Set(questions.values()).size !== positions.length
      )
        throw Error(
          "Cloud response must supply one distinct question per verified position",
        );

      return { draft, questions, prompt, raw };
    } catch (error) {
      if (attempt === 2) throw error;
      feedback =
        error instanceof Error ? error.message : "Invalid curriculum draft";
    }
  }
  throw Error("Curriculum could not be validated");
}

export async function rebuildLibrary(seed, generate, model = cloudModel) {
  const runId = randomUUID();
  const motifs = [];
  const curricula = [];
  const puzzles = [];

  for (const course of seed.curricula) {
    const motif = seed.motifs.find(({ id }) => id === course.motifId);
    if (!motif) throw Error("Missing motif for curriculum " + course.id);

    const positions = course.puzzleIds.map((id) => {
      const puzzle = seed.puzzles.find((item) => item.id === id);
      if (
        !puzzle ||
        puzzle.motifId !== motif.id ||
        puzzle.motifVersion !== motif.version
      )
        throw Error("Missing or mismatched verified position " + id);
      return puzzle;
    });
    const request = {
      task: "Rebuild this six-position chess curriculum from the supplied Lichess tags, source games, and Stockfish-checked continuations. Use the supplied shared theme at its full scope. Do not narrow it to one piece or phase unless every position supports that. Name it in plain chess terms and give the learner one short, concrete practice goal. For each position write a distinct, one-sentence question at most 110 characters that helps the player think before moving without revealing the answer. Start each question with What or Which. End with one question mark. Use no digits, notation, or periods. Never use these words in questions: checkmate, forced, winning, losing, sacrifice, undefended, guarantee, blunder. Never use the phrase only move. Ask the player what they would look for or compare without naming the solution piece, target, or move. Avoid evaluations and claims about the board you cannot see. Use a neutral decision question if a more specific question would reveal the answer. Do not change positions, move lines or their order. Return only a JSON object with motif, title, goal, and exercises (each entry has id and question).",
      theme: motif.source.tags,
      positions: positions.map((puzzle) => {
        const board = new Chess(puzzle.fen);
        return {
          id: puzzle.id,
          rating: puzzle.rating,
          source: puzzle.source.game,
          tags: puzzle.source.tags,
          fen: puzzle.fen,
          continuation: puzzle.solution.map((move) => board.move(move).san),
        };
      }),
    };
    const { draft, questions, prompt, raw } = await requestDraft(
      request,
      positions,
      generate,
    );
    const authorship = {
      model,
      route: "cloud",
      runId,
      promptVersion,
      promptHash: sha(prompt),
      responseHash: sha(raw),
    };
    const motifVersion = motif.version + 1;
    const motifName = draft.motif
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^\p{L}/u, (initial) => initial.toUpperCase());
    motifs.push({
      ...motif,
      version: motifVersion,
      name: motifName,
      authorship,
    });
    curricula.push({
      ...course,
      version: course.version + 1,
      motifVersion,
      title: draft.title,
      goal: draft.goal,
      authorship,
    });
    for (const puzzle of positions) {
      puzzles.push({
        ...puzzle,
        motifVersion,
        question: questions.get(puzzle.id),
        authorship,
      });
    }
  }
  if (
    puzzles.length !== seed.puzzles.length ||
    new Set(puzzles.map(({ id }) => id)).size !== puzzles.length
  )
    throw Error(
      "Every verified puzzle must belong to exactly one rebuilt curriculum",
    );

  return {
    ...seed,
    runId,
    generatedAt: new Date().toISOString(),
    motifs,
    curricula,
    puzzles,
  };
}

export async function saveLibrary(path, seed) {
  const temporary = path + "." + seed.runId + ".tmp";
  await writeFile(temporary, JSON.stringify(seed, null, 2) + "\n");
  await rename(temporary, path);
}

const codexDraftSchema = z
  .object({
    model: z.string().trim().min(1),
    courses: z.record(
      z.string(),
      z
        .object({
          motif: z.string(),
          title: z.string(),
          goal: z.string(),
          questions: z.record(z.string(), z.string()),
        })
        .strict(),
    ),
  })
  .strict();

async function rebuildFromCodexDraft(seed, draft) {
  const engine = await openEngine();
  const puzzles = [];
  try {
    for (const puzzle of seed.puzzles) {
      const verification = await verify(engine, puzzle);
      if (!verification)
        throw Error("Stockfish rejected " + puzzle.source.lichessId);
      puzzles.push({ ...puzzle, verification });
    }
  } finally {
    engine.close();
  }
  const publishedIds = new Map(
    puzzles.map((puzzle) => [puzzle.id, puzzle.source.lichessId]),
  );
  console.log("Stockfish reverified", puzzles.length, "source positions");

  return rebuildLibrary(
    { ...seed, puzzles },
    async (prompt) => {
      const request = z
        .object({
          theme: z.tuple([z.string()]),
          positions: z.array(z.object({ id: z.string() })),
        })
        .parse(JSON.parse(prompt));
      const course = draft.courses[request.theme[0]];
      if (!course) throw Error("No authored course for " + request.theme[0]);
      return JSON.stringify({
        motif: course.motif,
        title: course.title,
        goal: course.goal,
        exercises: request.positions.map(({ id }) => {
          const lichessId = publishedIds.get(id);
          const question =
            lichessId === undefined ? undefined : course.questions[lichessId];
          if (!question) throw Error("No authored question for " + id);
          return { id, question };
        }),
      });
    },
    draft.model,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output, draftFlag, draftPath, ...extra] = process.argv.slice(2);
  const key = process.env.GEMINI_API_KEY;
  if (
    !input ||
    !output ||
    extra.length ||
    (draftFlag ? draftFlag !== "--codex-draft" || !draftPath : !key)
  )
    throw Error(
      "Usage: node scripts/material/rebuild-library.mjs input.json output.json [--codex-draft draft.json]. Set GEMINI_API_KEY for live Gemini authoring.",
    );
  const seed = JSON.parse(await readFile(input, "utf8"));
  if (draftPath) {
    const draft = codexDraftSchema.parse(
      JSON.parse(await readFile(draftPath, "utf8")),
    );
    await saveLibrary(output, await rebuildFromCodexDraft(seed, draft));
  } else {
    const model = process.env.GEMINI_MODEL || cloudModel;
    const authored = await rebuildLibrary(
      seed,
      async (prompt) => {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(model) +
            ":generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
            signal: AbortSignal.timeout(60000),
          },
        );
        if (!response.ok)
          throw Error("Gemini Cloud returned HTTP " + response.status);
        const data = await response.json();
        return (
          data.candidates?.[0]?.content?.parts
            ?.filter(({ thought }) => !thought)
            .map(({ text }) => text)
            .join("") ?? ""
        );
      },
      model,
    );
    await saveLibrary(output, authored);
  }
}
