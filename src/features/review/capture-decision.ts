import { Chess, type Move } from "chess.js";

import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import { REVIEW_MOVE_TOLERANCE_CP } from "../../domain/analysis/review-training";
import { materialBalance } from "../../domain/game/board-balance";
import { pieceNames } from "../board/board-pieces";

export function captureDecision(
  capture: Move,
  reply: Move,
  forecast: ReviewReply,
  beforePlayerCp: number,
  preferredMove?: string,
) {
  if (!capture.captured || forecast.line[0] !== reply.lan) return null;
  const board = new Chess(reply.after);
  if (board.isGameOver()) return null;
  const playerCp = -forecast.evaluationCpFromSideToMove;
  const cost = beforePlayerCp - playerCp;
  const preferred = preferredMove
    ? new Chess(capture.before)
        .moves({ verbose: true })
        .find((move) => move.lan === preferredMove)
    : undefined;
  const target = pieceNames[capture.captured];
  const verdict =
    preferred?.lan === capture.lan
      ? `Taking the ${target} was Stockfish’s first choice.`
      : cost > REVIEW_MOVE_TOLERANCE_CP
        ? `Stockfish preferred ${preferred?.san ?? "another move"} to taking the ${target}.`
        : `Taking the ${target} kept you close to Stockfish’s best estimate.`;
  const [nextUci, answerUci] = forecast.line.slice(1);
  const inCheck = board.isCheck();
  const attacked =
    board.attackers(capture.to, reply.color).includes(reply.to) &&
    board.get(capture.to)?.color === capture.color;
  const piece = pieceNames[capture.promotion ?? capture.piece];
  let question = inCheck
    ? "Which legal answer to the check leaves your pieces protected?"
    : attacked
      ? `How can you protect your ${piece} on ${capture.to} without giving the ${pieceNames[reply.piece]} another target?`
      : "Which of your pieces needs attention before you make another capture?";
  let consequence = "";
  const line: string[] = [];
  if (nextUci) {
    const next = board.move(nextUci);
    line.push(next.san);
    if (
      attacked &&
      next.from === capture.to &&
      board.attackers(reply.to, capture.color).includes(next.to)
    )
      question = `Can your ${piece} move with a threat against the ${pieceNames[reply.piece]} on ${reply.to}?`;
    // A short engine line may stop before the tactical point. Check the actual
    // legal replies to its retreat separately from what Stockfish predicted.
    if (attacked && capture.captured === "p" && next.from === capture.to) {
      const recovery = board
        .moves({ square: reply.to, verbose: true })
        .find(
          (candidate) =>
            candidate.captured === "p" && candidate.san.endsWith("+"),
        );
      if (recovery)
        consequence = `Even after that ${piece} moves, the ${pieceNames[reply.piece]} can recover a pawn on ${recovery.to} with check in this line.`;
    }
    if (answerUci) {
      const answer = board.move(answerUci);
      line.push(answer.san);
      if (answer.captured) {
        const perspective = capture.color === "w" ? 1 : -1;
        const gain =
          (materialBalance(board.fen()) - materialBalance(capture.before)) *
          perspective;
        const check = board.isCheck() ? " with check" : "";
        if (gain <= 0 && answer.captured === "p" && capture.captured === "p")
          consequence = `In one Stockfish line, the extra pawn disappears when ${answer.color === "w" ? "White" : "Black"} takes on ${answer.to}${check}.`;
        else
          consequence = `In one Stockfish line, the ${pieceNames[answer.captured]} on ${answer.isEnPassant() ? answer.to.slice(0, 1) + answer.from.slice(1) : answer.to} falls${check}.`;
        if (attacked && answer.san.endsWith("+") && next.from === capture.to)
          question += ` How would you answer a check on ${answer.to} afterward?`;
      }
    }
  }
  return { verdict, consequence, question, line: line.join(" ") };
}
