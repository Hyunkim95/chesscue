import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import rookPortrait from "../../assets/brand/rook.webp";
import {
  collectCapture,
  terminalAssessment,
} from "../../domain/game/board-balance";
import type { GameRecord } from "../../domain/game/types";
import { BoardBalance } from "../board/BoardBalance";
import { pieceNames } from "../board/board-pieces";
import type { AnalyzeReply } from "./GuidedMoveFeedback";
import { ReviewBoard } from "./ReviewBoard";
import type { MoveAnalysisFact } from "../../domain/analysis/types";
import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import { compareCheckReplies } from "./check-replies";
import { captureDecision } from "./capture-decision";
import { explainContinuation } from "./explain-continuation";

export function ReviewContinuation({
  game,
  ply,
  analyzeReply,
  initialFact,
  onFirstMove,
  children,
}: {
  readonly game: GameRecord;
  readonly initialFact?: MoveAnalysisFact;
  readonly ply: number;
  readonly analyzeReply: AnalyzeReply | null;
  readonly onFirstMove: (uci: string) => void;
  readonly children: ReactNode;
}) {
  const [moves, setMoves] = useState<
    readonly { uci: string; forecast?: ReviewReply }[]
  >([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotionTarget, setPromotionTarget] = useState<Square | null>(null);
  const [failedFen, setFailedFen] = useState<string | null>(null);
  const { position, captures, comments, decision, evasions, lastMove, side } =
    useMemo(() => {
      const position = new Chess(game.initialFen);
      const history = game.moves
        .slice(0, ply - 1)
        .map(({ uci }) => position.move(uci));
      const side = position.turn();
      const branch = moves.map(({ uci }) => position.move(uci));
      const lastTurn = branch.slice(branch.length % 2 === 0 ? -2 : -1);
      const [playerMove, cpuMove] = lastTurn;
      const forecast = moves.at(-1)?.forecast;
      const preceding = moves.at(-3)?.forecast;
      const beforePlayerCp = preceding
        ? -preceding.evaluationCpFromSideToMove
        : initialFact?.evaluationBeforeCp;
      const decision =
        playerMove &&
        cpuMove &&
        forecast &&
        beforePlayerCp !== undefined &&
        !position.isGameOver()
          ? captureDecision(
              playerMove,
              cpuMove,
              forecast,
              beforePlayerCp,
              preceding ? preceding.line[1] : initialFact?.candidates[0]?.uci,
            )
          : null;
      return {
        decision,
        evasions:
          position.turn() === side
            ? compareCheckReplies(position, forecast?.line[1])
            : null,
        position,
        side,
        captures: [...history, ...branch].reduce<
          ReturnType<typeof collectCapture>
        >(collectCapture, []),
        comments: lastTurn.map((move, index) => ({
          san: move.san,
          color: move.color,
          text: explainContinuation(
            move,
            move === branch.at(-1) ? position : new Chess(move.after),
            lastTurn[index - 1],
          ),
        })),
        lastMove: branch.at(-1)?.lan ?? history.at(-1)?.lan ?? null,
      };
    }, [game, moves, ply, initialFact]);
  const fen = position.fen();
  const end = terminalAssessment(position);
  const cpuTurn = end === null && position.turn() !== side;
  useEffect(() => {
    if (!cpuTurn || failedFen === fen || analyzeReply === null) return;
    const controller = new AbortController();
    const reply = async () => {
      try {
        const forecast = await analyzeReply(fen, controller.signal);
        const uci = forecast?.line[0];
        if (controller.signal.aborted) return;
        if (
          forecast &&
          uci &&
          new Chess(fen)
            .moves({ verbose: true })
            .some((move) => move.lan === uci)
        ) {
          setMoves((current) => [...current, { uci, forecast }]);
        } else {
          setFailedFen(fen);
        }
      } catch {
        if (!controller.signal.aborted) setFailedFen(fen);
      }
    };
    void reply();
    return () => {
      controller.abort();
    };
  }, [analyzeReply, cpuTurn, failedFen, fen]);

  const choices =
    selected === null
      ? []
      : position.moves({ square: selected, verbose: true });
  const play = (uci: string) => {
    if (moves.length === 0) onFirstMove(uci);
    setMoves([...moves, { uci }]);
    setSelected(null);
    setPromotionTarget(null);
  };
  const select = (square: Square) => {
    if (cpuTurn || end !== null) return;
    const move = choices.find((candidate) => candidate.to === square);
    if (move?.promotion !== undefined) {
      setPromotionTarget(square);
    } else if (move !== undefined) {
      play(move.lan);
    } else {
      setSelected(
        square !== selected && position.get(square)?.color === side
          ? square
          : null,
      );
      setPromotionTarget(null);
    }
  };
  const unavailable = cpuTurn && (failedFen === fen || analyzeReply === null);
  const turnLabel =
    end?.kind === "checkmate"
      ? position.turn() === side
        ? "Checkmate. CPU wins."
        : "Checkmate. You win."
      : end?.kind === "draw"
        ? "Draw."
        : unavailable
          ? "CPU reply unavailable"
          : cpuTurn
            ? "CPU is thinking…"
            : position.isCheck()
              ? "Your move · In check"
              : "Your move";
  const original = game.moves[ply - 1];
  return (
    <div className="game-review__training-layout game-review__continuation">
      <div className="game-review__board-stage">
        <p className="game-review__turn" role="status">
          {turnLabel}
        </p>
        <ReviewBoard
          fen={fen}
          orientation={side === "w" ? "white" : "black"}
          lastMoveUci={lastMove}
          selectedSquare={selected}
          legalTargets={choices.map((move) => move.to)}
          disabled={cpuTurn || end !== null}
          onSquareSelect={select}
        />
        {promotionTarget !== null && (
          <div
            className="game-review__feedback-controls"
            role="group"
            aria-label="Promote pawn"
          >
            {choices
              .filter(
                (move) =>
                  move.to === promotionTarget && move.promotion !== undefined,
              )
              .map((move) => (
                <button
                  key={move.lan}
                  type="button"
                  onClick={() => {
                    play(move.lan);
                  }}
                >
                  {pieceNames[move.promotion ?? "q"]}
                </button>
              ))}
          </div>
        )}
        <BoardBalance fen={fen} captures={captures} />
        {moves.length > 0 && (
          <button
            type="button"
            className="game-review__quiet-action"
            onClick={() => {
              // Return to the learner’s decision, including while Stockfish is thinking.
              setMoves((current) =>
                current.slice(0, current.length % 2 === 0 ? -2 : -1),
              );
              setSelected(null);
              setPromotionTarget(null);
              setFailedFen(null);
            }}
          >
            Undo my move
          </button>
        )}
      </div>
      <div className="game-review__prompt">
        <section className="game-review__rook" aria-label="Rook commentary">
          <img src={rookPortrait} alt="" width="44" height="44" />
          <div>
            <h3>Rook</h3>
            <div aria-live="polite" className="game-review__observations">
              {evasions ? (
                <>
                  <p>
                    {evasions.options.length === 1
                      ? "You have one legal reply to this check."
                      : `You have ${String(evasions.options.length)} legal replies to this check.`}
                  </p>
                  {evasions.options.slice(0, 3).map((option) => (
                    <p key={option.san}>
                      <strong>{option.san}</strong> {option.explanation}
                    </p>
                  ))}
                  {evasions.options.length > 3 && (
                    <details key={fen}>
                      <summary>Other legal replies</summary>
                      {evasions.options.slice(3).map((option) => (
                        <p key={option.san}>
                          <strong>{option.san}</strong> {option.explanation}
                        </p>
                      ))}
                    </details>
                  )}
                  {evasions.preferred && (
                    <details key={fen + "-choice"}>
                      <summary>Stockfish’s choice</summary>
                      <p>{evasions.preferred}</p>
                    </details>
                  )}
                </>
              ) : comments.length === 0 ? (
                <p>
                  {original
                    ? `In your game you played ${original.san} here. `
                    : ""}
                  Try a move and I’ll follow along.
                </p>
              ) : (
                comments.map(({ san, color, text }) => (
                  <p key={color}>
                    <strong>
                      {color === side ? "You" : "CPU"} · {san}
                    </strong>{" "}
                    {decision && color === side
                      ? (san.includes("+") ? text + " " : "") + decision.verdict
                      : text}
                  </p>
                ))
              )}
              {decision && !evasions && (
                <>
                  {decision.consequence && <p>{decision.consequence}</p>}
                  <p>
                    <strong>Think next</strong> {decision.question}
                  </p>
                  {decision.line && (
                    <details key={fen}>
                      <summary>One Stockfish line</summary>
                      <p>{decision.line}</p>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
        {unavailable && analyzeReply !== null && (
          <button
            type="button"
            onClick={() => {
              setFailedFen(null);
            }}
          >
            Retry CPU reply
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
