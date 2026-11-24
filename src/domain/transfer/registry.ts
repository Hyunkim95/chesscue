import type { CuratedTransferExercise } from "./types";
import { validateCuratedTransferExercise } from "./validate";

const provenance =
  "Opening-derived position verified with Stockfish 19 Lite WASM at 700 ms and MultiPV 3 on 2026-11-24.";

const verification = (
  bestMoveUci: string,
  candidates: CuratedTransferExercise["verification"]["candidates"],
  toleranceCp = 35,
): CuratedTransferExercise["verification"] => ({
  engine: "Stockfish 19 Lite WASM",
  moveTimeMs: 700,
  multiPv: 3,
  verifiedAt: "2026-11-24",
  toleranceCp,
  bestMoveUci,
  candidates,
});

const candidates: readonly CuratedTransferExercise[] = [
  {
    schemaVersion: 1,
    id: "hanging-piece-attacked-bishop-close",
    version: "1.0.0",
    theme: "hanging-piece",
    difficulty: "close",
    fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
    acceptableMoves: ["b5a4", "b5c6"],
    prompt: "Your bishop is attacked. Find a safe response.",
    explanation:
      "The pawn attacks the bishop. Moving it or exchanging it prevents a free loss of material.",
    provenance,
    verification: verification("b5a4", [
      { uci: "b5a4", evaluationCp: 37 },
      { uci: "b5c6", evaluationCp: 18 },
      { uci: "b5c4", evaluationCp: -6 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "hanging-piece-bishop-pressure-unlabeled",
    version: "1.0.0",
    theme: "hanging-piece",
    difficulty: "unlabeled",
    fen: "rnbqkb1r/ppp2pp1/4pn1p/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 0 5",
    acceptableMoves: ["g5f6"],
    prompt: "What would you play here?",
    explanation:
      "The bishop is under pressure. Exchanging on f6 removes the attack and changes Black's pawn structure.",
    provenance,
    verification: verification("g5f6", [
      { uci: "g5f6", evaluationCp: 128 },
      { uci: "g5f4", evaluationCp: 7 },
      { uci: "g5h4", evaluationCp: 0 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "one-move-threat-f7-mate-close",
    version: "1.0.0",
    theme: "one-move-threat",
    difficulty: "close",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    acceptableMoves: ["h5f7"],
    prompt: "Find the forcing move that ends the game.",
    explanation:
      "The queen captures on f7 with checkmate because the bishop protects that square.",
    provenance,
    verification: verification("h5f7", [
      { uci: "h5f7", evaluationCp: 99_999 },
      { uci: "h5g5", evaluationCp: -241 },
      { uci: "h5h4", evaluationCp: -302 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "one-move-threat-back-rank-unlabeled",
    version: "1.0.0",
    theme: "one-move-threat",
    difficulty: "unlabeled",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    acceptableMoves: ["e1e8"],
    prompt: "What would you play here?",
    explanation:
      "The rook reaches the back rank with checkmate because the king's own pawns remove every escape square.",
    provenance,
    verification: verification("e1e8", [
      { uci: "e1e8", evaluationCp: 99_999 },
      { uci: "g2g4", evaluationCp: 710 },
      { uci: "g2g3", evaluationCp: 678 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "premature-central-exchange-queens-gambit-close",
    version: "1.0.0",
    theme: "premature-central-exchange",
    difficulty: "close",
    fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
    acceptableMoves: ["c4d5", "c1g5", "g1f3"],
    prompt: "Decide whether to exchange or improve a piece first.",
    explanation:
      "The center supports several good plans. Compare the recapture before exchanging, or improve a piece while keeping options.",
    provenance,
    verification: verification("c4d5", [
      { uci: "c4d5", evaluationCp: 26 },
      { uci: "c1g5", evaluationCp: 24 },
      { uci: "g1f3", evaluationCp: 16 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "premature-central-exchange-slav-unlabeled",
    version: "1.0.0",
    theme: "premature-central-exchange",
    difficulty: "unlabeled",
    fen: "rnbqkb1r/pp3ppp/2p1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5",
    acceptableMoves: ["e2e3", "c1g5", "d1d3"],
    prompt: "What would you play here?",
    explanation:
      "Improving coordination keeps the central pawn decision flexible instead of resolving it without a reason.",
    provenance,
    verification: verification("e2e3", [
      { uci: "e2e3", evaluationCp: 27 },
      { uci: "c1g5", evaluationCp: 23 },
      { uci: "d1d3", evaluationCp: 19 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "king-safety-castle-close",
    version: "1.0.0",
    theme: "king-safety",
    difficulty: "close",
    fen: "rnbqk2r/ppp1bppp/4pn2/3p4/3P4/3BPN2/PPP2PPP/RNBQK2R w KQkq - 2 5",
    acceptableMoves: ["e1g1"],
    prompt: "Secure your king before starting a new plan.",
    explanation:
      "Castling moves the king away from the open center and connects the rook to the rest of the position.",
    provenance,
    verification: verification("e1g1", [
      { uci: "e1g1", evaluationCp: 13 },
      { uci: "b2b3", evaluationCp: 12 },
      { uci: "b1d2", evaluationCp: 8 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "king-safety-opening-choice-unlabeled",
    version: "1.0.0",
    theme: "king-safety",
    difficulty: "unlabeled",
    fen: "r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5",
    acceptableMoves: ["a2a4", "e1g1", "b1c3"],
    prompt: "What would you play here?",
    explanation:
      "Castling is the direct safety choice. The other accepted moves also keep development healthy and preserve castling next.",
    provenance,
    verification: verification("a2a4", [
      { uci: "a2a4", evaluationCp: 31 },
      { uci: "e1g1", evaluationCp: 30 },
      { uci: "b1c3", evaluationCp: 29 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "development-open-center-close",
    version: "1.0.0",
    theme: "development",
    difficulty: "close",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    acceptableMoves: ["d2d4", "f1b5", "f1c4"],
    prompt: "Bring another piece into the game or claim the center.",
    explanation:
      "Each accepted move improves activity by developing a bishop or challenging the center before repeating moves.",
    provenance,
    verification: verification("d2d4", [
      { uci: "d2d4", evaluationCp: 33 },
      { uci: "f1b5", evaluationCp: 32 },
      { uci: "f1c4", evaluationCp: 21 },
    ]),
  },
  {
    schemaVersion: 1,
    id: "development-first-pieces-unlabeled",
    version: "1.0.0",
    theme: "development",
    difficulty: "unlabeled",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    acceptableMoves: ["g1f3", "b1c3", "d2d4"],
    prompt: "What would you play here?",
    explanation:
      "Developing a knight or challenging the center brings more force into play and prepares safe castling.",
    provenance,
    verification: verification("g1f3", [
      { uci: "g1f3", evaluationCp: 30 },
      { uci: "b1c3", evaluationCp: 13 },
      { uci: "d2d4", evaluationCp: -3 },
    ]),
  },
];

export const curatedTransferRegistry: readonly CuratedTransferExercise[] =
  Object.freeze(
    candidates.flatMap((candidate) => {
      const validated = validateCuratedTransferExercise(candidate);
      return validated.ok ? [validated.exercise] : [];
    }),
  );

export const transferExercisesForTheme = (
  theme: CuratedTransferExercise["theme"],
): readonly CuratedTransferExercise[] =>
  curatedTransferRegistry.filter((exercise) => exercise.theme === theme);
