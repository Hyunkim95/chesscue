import type { LessonFactPacket, LessonSelectionEvidence } from "./types";

export const hangingPieceFacts: LessonFactPacket = {
  packetId: "facts-hanging-1",
  theme: "hanging-piece",
  fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
  sourceGameIds: ["game-1", "game-2"],
  endangeredSquare: "b5",
  threatenedMove: "a6b5",
  acceptableMoves: ["b5c6", "b5a4"],
  reasonCodes: ["move-to-safety", "defend-with-tempo"],
  transferMoves: ["b5a4"],
  allowedNumbers: [1, 3],
};

export const hangingPieceSelectionEvidence: LessonSelectionEvidence = {
  theme: "hanging-piece",
  evidenceCount: 3,
  confidence: 0.82,
  priority: 0.9,
  factPacket: hangingPieceFacts,
};
