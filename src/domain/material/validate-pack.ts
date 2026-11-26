import { Chess } from "chess.js";
import { z } from "zod";
import { learningThemeSchema } from "../analysis/types";
import {
  generationSchema,
  sourceSchema,
  engineProofSchema,
  checkedLine,
} from "./verified";
import { reflectionSchema } from "./reflection-schema";
import { validateGeneratedTransferExercise } from "../transfer/validate";

const copy = z.object({
  title: z.string().min(1).max(60),
  question: reflectionSchema,
  insight: z.string().min(1),
  authorship: generationSchema,
});
const source = sourceSchema.extend({
  id: z.string().optional(),
  game: z.string().optional(),
});
const candidate = z.object({
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  evaluationCp: z.number().int(),
});
const evidence = z.object({
  engine: z.literal("Stockfish 19 Lite WASM"),
  moveTimeMs: z.number().int().positive(),
  multiPv: z.number().int().positive(),
  verifiedAt: z.iso.date(),
});
const puzzle = copy.extend({
  id: z.string().min(1),
  theme: learningThemeSchema,
  fen: z.string(),
  source,
  acceptableMoves: z.array(z.string()).min(1),
  difficulty: z.enum(["close", "unlabeled"]),
  bestSan: z.string(),
  rejectedExchange: candidate.optional(),
  verification: engineProofSchema,
});
const history = copy.extend({
  fen: z.string(),
  source: source.extend({ game: z.string().min(1) }),
  continuation: z.array(z.string()).min(1),
  bestSan: z.string(),
  verification: evidence.extend({
    candidates: z
      .array(
        candidate.extend({
          principalVariation: z.array(z.string()).min(1),
          depth: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
});
const three = z.tuple([history, history, history]);
const schema = z.object({
  version: z.literal(2),
  runId: z.uuid(),
  generatedAt: z.iso.datetime(),
  positions: z.array(puzzle).min(1),
  historical: z.object({ rook: three, attack: three }),
  openings: z.array(
    z.object({
      fen: z.string(),
      afterMoves: z.array(z.string()),
      candidateMoves: z.array(z.string()).min(1),
      source,
      theme: learningThemeSchema,
      exerciseId: z.string(),
      verification: evidence.extend({ candidates: z.array(candidate).min(1) }),
    }),
  ),
  skills: z.record(
    z.enum([
      "vision",
      "threats",
      "safety",
      "endgames",
      "backrank",
      "forks",
      "rook",
    ]),
    copy,
  ),
});
export function parseStarterPack(raw: unknown) {
  const pack = schema.parse(raw);
  for (const item of [
    ...pack.positions,
    ...pack.historical.rook,
    ...pack.historical.attack,
    ...Object.values(pack.skills),
  ]) {
    if (item.authorship.runId !== pack.runId)
      throw Error("Mismatched material generation run");
  }
  const seen = new Set<string>();
  for (const item of pack.positions) {
    const verified = validateGeneratedTransferExercise({
      schemaVersion: 1,
      version: "2.0.0",
      ...item,
      prompt: item.question,
      explanation: item.insight,
      provenance: item.authorship.responseHash,
    });
    if (!verified.ok || seen.has(item.fen))
      throw Error("Invalid generated exercise: " + item.id);
    seen.add(item.fen);
    const board = new Chess(item.fen);
    const move = board.move(item.verification.bestMoveUci);
    if (
      move.san !== item.bestSan ||
      ![
        "Stockfish’s highest-scoring checked move was " + move.san + ".",
        "The checked line begins with " + move.san + ".",
      ].includes(item.insight)
    )
      throw Error("Puzzle copy does not match its engine evidence");
    if (item.theme === "premature-central-exchange") {
      const exchange = item.rejectedExchange;
      if (!exchange) throw Error("Missing exchange evidence");
      const played = new Chess(item.fen).move(exchange.uci);
      if (
        played.piece !== "p" ||
        played.captured !== "p" ||
        !["e4", "d4", "e5", "d5"].includes(played.to) ||
        (item.verification.candidates[0]?.evaluationCp ?? -Infinity) -
          exchange.evaluationCp <=
          35
      )
        throw Error("Unsupported exchange claim");
    }
    if (item.theme === "one-move-threat" && !board.isCheckmate())
      throw Error("Unsupported mate");
    if (
      item.theme === "king-safety" &&
      !move.isKingsideCastle() &&
      !move.isQueensideCastle()
    )
      throw Error("Unsupported castling task");
    if (
      item.theme === "development" &&
      (!["n", "b"].includes(move.piece) ||
        !move.from.endsWith(move.color === "w" ? "1" : "8"))
    )
      throw Error("Unsupported development task");
    if (
      item.theme === "hanging-piece" &&
      (!move.captured ||
        move.captured === "p" ||
        board
          .moves({ verbose: true })
          .some((m) => m.to === move.to && m.isCapture()))
    )
      throw Error("Unsupported loose-piece task");
  }
  for (const skill of Object.values(pack.skills)) {
    if (
      ![
        ...pack.positions,
        ...pack.historical.rook,
        ...pack.historical.attack,
      ].some((sample) => sample.insight === skill.insight)
    )
      throw Error("Skill introduction lacks a checked source");
  }
  for (const item of pack.historical.attack) {
    const board = new Chess(item.fen);
    board.move(item.bestSan);
    if (!board.isCheck()) throw Error("Unsupported king attack");
  }
  for (const item of pack.historical.rook) {
    if (
      /[qnb]/i.test(item.fen.split(" ")[0] ?? "") ||
      new Chess(item.fen).move(item.bestSan).piece !== "r"
    )
      throw Error("Unsupported rook ending");
  }
  for (const item of [...pack.historical.rook, ...pack.historical.attack]) {
    const board = new Chess(item.fen);
    const first = item.continuation.map((san) => board.move(san))[0];
    const best = item.verification.candidates[0];
    const recorded = item.verification.candidates.find(
      (c) => c.uci === first?.lan,
    );
    if (!best || !recorded || best.evaluationCp - recorded.evaluationCp > 35)
      throw Error("Historical decision lacks engine support");
    if (
      first?.san !== item.bestSan ||
      ![
        "The recorded game continued with " +
          item.continuation.join(", ") +
          ".",
        "The recorded move was " + first.san + ".",
      ].includes(item.insight)
    )
      throw Error("Historical text does not match its source");
    for (const c of item.verification.candidates) {
      const line = new Chess(item.fen);
      if (c.principalVariation[0] !== c.uci)
        throw Error("Invalid historical engine evidence");
      for (const uci of c.principalVariation) line.move(uci);
    }
  }
  for (const item of pack.openings) {
    const board = new Chess();
    for (const move of item.afterMoves) board.move(move);
    if (board.fen() !== item.fen)
      throw Error("Opening source does not match board");
    const related = pack.positions.find(
      (p) =>
        p.id === item.exerciseId &&
        p.theme === item.theme &&
        p.source.sourceHash === item.source.sourceHash,
    );
    const best = item.verification.candidates[0];
    if (!related || !best)
      throw Error("Opening has no verified learning source");
    for (const move of item.candidateMoves) {
      if (!checkedLine(item.fen, [move])) throw Error("Illegal opening move");
      if (
        !item.verification.candidates.some(
          (c) => c.uci === move && best.evaluationCp - c.evaluationCp <= 35,
        )
      )
        throw Error("Unverified opening candidate");
    }
  }
  return pack;
}
