import { expect, it } from "vitest";
import payload from "./starter.generated.json" with { type: "json" };
import { parseStarterPack } from "./validate-pack";
import { libraryRoadmap, roadmapSchema } from "../study/roadmap";
import { classifyLearningTheme } from "../analysis/classify-theme";
import { archiveExercise } from "./archive-exercise";
import { generatedMove } from "../../test/generated-position";
it("admits each generated item only with matching source, engine evidence and generation IDs", () => {
  expect(parseStarterPack(payload).positions.length).toBe(
    payload.positions.length,
  );
  const draft = structuredClone(payload),
    first = draft.positions[0];
  if (!first) throw Error("No starter material");
  first.authorship.runId = crypto.randomUUID();
  expect(() => parseStarterPack(draft)).toThrow();
  first.authorship.runId = draft.runId;
  first.insight = "A forced mate in every line.";
  expect(() => parseStarterPack(draft)).toThrow();
});
it("rejects obsolete or rewritten saved lessons", () => {
  const valid = libraryRoadmap("attack");
  expect(roadmapSchema.safeParse(valid).success).toBe(true);
  expect(
    roadmapSchema.safeParse({ ...valid, version: 1, source: "library" })
      .success,
  ).toBe(false);
  expect(
    roadmapSchema.safeParse({
      ...valid,
      notes: ["Invented chess claim.", ...valid.notes.slice(1)],
    }).success,
  ).toBe(false);
});
it("never calls the engine's preferred central exchange premature", () => {
  const record = payload.positions.find((p) => p.rejectedExchange);
  if (!record?.rejectedExchange) throw Error("Exchange evidence missing");
  const uci = record.rejectedExchange.uci;
  expect(
    classifyLearningTheme({
      fenBefore: record.fen,
      playedMoveUci: uci,
      bestMoveUci: uci,
      ply: 4,
      impactCp: 80,
    }),
  ).not.toBe("premature-central-exchange");
  expect(
    classifyLearningTheme({
      fenBefore: record.fen,
      playedMoveUci: uci,
      bestMoveUci: record.verification.bestMoveUci,
      ply: 4,
      impactCp: 80,
    }),
  ).toBe("premature-central-exchange");
});
it("opens a distinct archive follow-up only when its checked move exhibits the requested motif", () => {
  const original = generatedMove("one-move-threat", "close").exercise,
    candidate = generatedMove("one-move-threat", "unlabeled").exercise;
  const drill = {
    exercise: original,
    followUps: [],
    played: "",
    candidate: original.verification.bestMoveUci,
    phase: "middlegame" as const,
    backRank: true,
    imported: false,
    moveLabel: "Test",
    completedAt: "2026-11-26T00:00:00Z",
  };
  const historical = {
    orientation: "white" as const,
    scoreUrl: candidate.source.url,
    lesson: {
      fen: candidate.fen,
      question: candidate.prompt,
      title: "Archive test",
      insight: candidate.explanation,
      continuation: [],
    },
    proof: {
      source: candidate.source,
      authorship: { ...candidate.authorship, route: "cloud" as const },
      verification: {
        ...candidate.verification,
        engine: "Stockfish 19 Lite WASM" as const,
        principalVariation: [...candidate.verification.principalVariation],
        candidates: [...candidate.verification.candidates],
      },
    },
  };
  expect(archiveExercise(drill, historical)).toBeNull();
  expect(
    archiveExercise(drill, historical, "back-rank")?.acceptableMoves,
  ).toContain(candidate.verification.bestMoveUci);
  expect(
    archiveExercise({ ...drill, exercise: candidate }, historical, "back-rank"),
  ).toBeNull();
  expect(
    archiveExercise(
      {
        ...drill,
        exercise: { ...original, theme: "king-safety" },
        backRank: false,
      },
      historical,
    ),
  ).toBeNull();
});
