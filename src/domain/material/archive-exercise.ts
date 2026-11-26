import { sameTransferPosition } from "../transfer/validate";
import { Chess } from "chess.js";
import type { VerifiedGameDrill } from "../curriculum/game-drill";
import type { HistoricalGame } from "../study/historical-game";
import { exerciseSchema, type HistoricalProof } from "./verified";
import type { VerifiedTransferExercise } from "../transfer/types";

export function archiveExercise(
  drill: VerifiedGameDrill,
  game: HistoricalGame & { proof: HistoricalProof },
  motif?: "back-rank" | "other" | "uncertain",
): VerifiedTransferExercise | null {
  const { fen, question, insight } = game.lesson,
    { verification, source, authorship } = game.proof;
  if (
    sameTransferPosition(fen, drill.exercise.fen) ||
    source.url !== game.scoreUrl ||
    (drill.backRank && motif !== "back-rank")
  )
    return null;
  const board = new Chess(fen),
    theme = drill.exercise.theme;
  function matches(uci: string) {
    const after = new Chess(fen),
      m = after.move(uci);
    switch (theme) {
      case "one-move-threat":
        return after.isCheckmate();
      case "hanging-piece":
        return (
          !!m.captured &&
          m.captured !== "p" &&
          !after
            .moves({ verbose: true })
            .some((reply) => reply.to === m.to && reply.isCapture())
        );
      case "development":
        return (
          (m.piece === "n" || m.piece === "b") &&
          m.from.endsWith(m.color === "w" ? "1" : "8") &&
          board.moveNumber() <= 10
        );
      case "king-safety":
        return m.isKingsideCastle() || m.isQueensideCastle();
      case "endgame-technique":
        return board.board().flat().filter(Boolean).length <= 8;
      case "premature-central-exchange": {
        const played = game.lesson.continuation[0];
        if (!played) return false;
        const exchange = new Chess(fen).move(played);
        const candidate = verification.candidates.find(
          (c) => c.uci === exchange.lan,
        );
        const best = verification.candidates[0];
        return (
          exchange.piece === "p" &&
          exchange.captured === "p" &&
          ["d4", "e4", "d5", "e5"].includes(exchange.to) &&
          !!candidate &&
          !!best &&
          best.evaluationCp - candidate.evaluationCp >
            verification.toleranceCp &&
          uci !== candidate.uci
        );
      }
      default:
        return true;
    }
  }
  const best = verification.candidates[0];
  if (!best || !matches(best.uci)) return null;
  const acceptableMoves = verification.candidates
    .filter(
      (c) =>
        best.evaluationCp - c.evaluationCp <= verification.toleranceCp &&
        matches(c.uci),
    )
    .map((c) => c.uci);
  const result = exerciseSchema.safeParse({
    schemaVersion: 1,
    version: "2.0.0",
    id: "archive-" + source.sourceHash + "-" + String(source.ply),
    theme,
    difficulty: "close",
    fen,
    acceptableMoves,
    prompt: question,
    explanation: insight,
    source,
    authorship,
    verification,
    provenance: [authorship.model, game.scoreUrl, source.sourceHash].join(
      " · ",
    ),
  });
  return result.success ? result.data : null;
}
