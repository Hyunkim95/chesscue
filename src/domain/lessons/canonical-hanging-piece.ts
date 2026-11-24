import type { LessonFactPacket } from "./types";

export const canonicalHangingPieceFacts: LessonFactPacket = Object.freeze({
  packetId: "canonical-hanging-piece-ruy-lopez",
  theme: "hanging-piece",
  fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
  sourceGameIds: Object.freeze(["canonical-ruy-lopez"]),
  endangeredSquare: "b5",
  threatenedMove: "a6b5",
  acceptableMoves: Object.freeze(["b5c6", "b5a4"]),
  reasonCodes: Object.freeze(["move-to-safety", "defend-with-tempo"]),
  transferMoves: Object.freeze(["b5a4"]),
  allowedNumbers: Object.freeze([1, 3]),
});
