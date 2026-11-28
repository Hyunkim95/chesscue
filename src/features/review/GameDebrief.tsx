import { Chess, type Square } from "chess.js";
import { useMemo, type ReactNode } from "react";

import type { ReplayFrame } from "../../domain/analysis/replay-game";
import type { PlayerColor } from "../../domain/game/types";
import type { CoachMoment } from "../../domain/game/coach-moments";
import { pieceNames } from "../board/board-pieces";
import { explainContinuation } from "./explain-continuation";
import { ReviewBoard } from "./ReviewBoard";

export interface DebriefSelection {
  readonly finding: "turning-point" | "strong-move";
  readonly replyShown: boolean;
  readonly replayPly: number | null;
}

function checkedMove(frames: readonly ReplayFrame[], ply: number) {
  const before = frames[ply - 1];
  const after = frames[ply];
  if (!before || !after?.lastMoveUci) return null;
  try {
    const board = new Chess(before.fen);
    const move = board.move(after.lastMoveUci);
    if (board.fen() !== after.fen) return null;
    const checkedKing = board.isCheck()
      ? board.findPiece({ type: "k", color: board.turn() })
      : [];
    const squares: Square[] = [move.from, move.to, ...checkedKing];
    return {
      move,
      squares,
      frame: after,
      explanation: explainContinuation(move, board),
    };
  } catch {
    return null;
  }
}

function moveCaption(checked: NonNullable<ReturnType<typeof checkedMove>>) {
  const { move } = checked;
  const moveNumber = new Chess(move.before).moveNumber();
  return "Move " + String(moveNumber) + " · " + move.san;
}

export function GameDebrief({
  compact = false,
  title,
  source,
  frames,
  orientation,
  strongPly,
  turningPly,
  selection,
  onSelect,
  coachNotes,
  onExplore,
  onPractice,
}: {
  readonly compact?: boolean;
  readonly title: string;
  readonly source?: ReactNode;
  readonly frames: readonly ReplayFrame[];
  readonly orientation: PlayerColor;
  readonly strongPly: number | undefined;
  readonly turningPly: number | undefined;
  readonly selection: DebriefSelection;
  readonly onSelect: (selection: DebriefSelection) => void;
  readonly coachNotes: readonly CoachMoment[];
  readonly onExplore?: ((frame: ReplayFrame) => void) | undefined;
  readonly onPractice?: (() => void) | undefined;
}) {
  const { strongMove, turningMove, reply } = useMemo(
    () => ({
      strongMove:
        strongPly === undefined ? null : checkedMove(frames, strongPly),
      turningMove:
        turningPly === undefined ? null : checkedMove(frames, turningPly),
      reply:
        turningPly === undefined ? null : checkedMove(frames, turningPly + 1),
    }),
    [frames, strongPly, turningPly],
  );
  const showTurningPoint =
    turningMove !== null &&
    (selection.finding === "turning-point" || !strongMove);
  const played = showTurningPoint ? turningMove : strongMove;
  const replyShown = showTurningPoint && selection.replyShown && reply !== null;
  const replayIndex =
    selection.replayPly === null
      ? null
      : Math.min(selection.replayPly, frames.length - 1);
  const replayFrame = replayIndex === null ? undefined : frames[replayIndex];
  const replayMove = useMemo(
    () => (replayIndex === null ? null : checkedMove(frames, replayIndex)),
    [frames, replayIndex],
  );
  const frame =
    replayFrame ?? (replyShown ? reply.frame : played?.frame) ?? frames.at(-1);
  const focus = replayFrame
    ? (replayMove?.squares ?? [])
    : showTurningPoint
      ? (reply?.squares ?? [])
      : (strongMove?.squares ?? []);

  let explanation = played?.explanation;
  if (showTurningPoint) {
    if (!reply) {
      explanation =
        "Stockfish found a stronger move from the position before this move.";
    } else if (replyShown) {
      explanation = reply.explanation;
    } else {
      explanation = "Your opponent replied " + reply.move.san;
      if (reply.move.san.endsWith("#"))
        explanation += " and delivered checkmate";
      else if (reply.move.captured)
        explanation += ", capturing your " + pieceNames[reply.move.captured];
      explanation += ".";
    }
  }

  function select(finding: typeof selection.finding) {
    onSelect({ finding, replyShown: false, replayPly: null });
  }

  function navigate(ply: number) {
    onSelect({ ...selection, replayPly: ply, replyShown: false });
  }

  const findings = (strongMove ?? turningMove) && (
    <div
      className="game-review__debrief-findings"
      role="group"
      aria-label="Game findings"
    >
      {turningMove && (
        <button
          type="button"
          className="review-action"
          aria-pressed={!replayFrame && showTurningPoint}
          onClick={() => {
            select("turning-point");
          }}
        >
          Turning point
        </button>
      )}
      {strongMove && (
        <button
          type="button"
          className="review-action"
          aria-pressed={!replayFrame && !showTurningPoint}
          onClick={() => {
            select("strong-move");
          }}
        >
          Strong move
        </button>
      )}
    </div>
  );
  const replayControls = frame && (
    <div
      className="game-review__debrief-replay"
      role="group"
      aria-label="Replay controls"
    >
      <div>
        <button
          type="button"
          className="review-action"
          aria-label="Previous move"
          title="Previous move"
          disabled={frame.ply === 0}
          onClick={() => {
            navigate(frame.ply - 1);
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span>
          Position {frame.ply} of {frames.length - 1}
        </span>
        <button
          type="button"
          className="review-action"
          aria-label="Next move"
          title="Next move"
          disabled={frame.ply === frames.length - 1}
          onClick={() => {
            navigate(frame.ply + 1);
          }}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <input
        type="range"
        aria-label="Move through the game"
        min={0}
        max={frames.length - 1}
        value={frame.ply}
        onChange={(event) => {
          navigate(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
  const practiceAction = onPractice && showTurningPoint && !replayFrame && (
    <button
      type="button"
      className="game-review__quiet-action"
      onClick={onPractice}
    >
      Explore the turning point
    </button>
  );
  const actions = (
    <div className="game-review__debrief-actions">
      {onExplore && frame && (
        <button
          type="button"
          className={
            compact
              ? "game-review__primary game-review__debrief-explore"
              : "review-action game-review__debrief-explore"
          }
          onClick={() => {
            onExplore(frame);
          }}
        >
          Explore with Rook
        </button>
      )}
      {!replayFrame && showTurningPoint && reply && (
        <button
          type="button"
          className="review-action"
          onClick={() => {
            onSelect({
              finding: "turning-point",
              replyShown: !replyShown,
              replayPly: null,
            });
          }}
        >
          {replyShown ? "Back to your move" : "Show the reply"}
        </button>
      )}
      {!compact && practiceAction}
    </div>
  );
  return (
    <>
      <header
        className={
          compact ? "game-review__header review-matchup" : "game-review__header"
        }
      >
        <h2 id="game-review-title">{title}</h2>
        {source}
      </header>
      {!compact && findings}
      <div className="game-review__debrief">
        <div className="game-review__debrief-board">
          {frame && (
            <ReviewBoard
              fen={frame.fen}
              orientation={orientation}
              lastMoveUci={frame.lastMoveUci}
              focusSquares={focus}
            />
          )}
          {!compact && replayControls}
        </div>
        <div
          className={
            compact
              ? "game-review__debrief-notes game-review__debrief-notes--compact"
              : "game-review__debrief-notes"
          }
        >
          {compact && actions}
          <div className="game-review__debrief-explanation" aria-live="polite">
            {replayFrame ? (
              replayMove ? (
                <>
                  <p className="game-review__eyebrow game-review__debrief-caption">
                    {moveCaption(replayMove)}
                  </p>
                  <p>{replayMove.explanation}</p>
                </>
              ) : (
                <p>Starting position</p>
              )
            ) : !played ? (
              <p>No key moment was verified. You can still replay the game.</p>
            ) : (
              <>
                <h3>{moveCaption(replyShown ? reply : played)}</h3>
                <p>{explanation}</p>
              </>
            )}
          </div>
          {!compact && actions}
        </div>
      </div>
      {compact && (frame ?? strongMove ?? turningMove) && (
        <details className="panel-disclosure">
          <summary>Full replay and findings</summary>
          {findings}
          {replayControls}
          {practiceAction}
        </details>
      )}
      {coachNotes.length > 0 && (
        <details className="game-review__replay">
          <summary>Saved coach notes</summary>
          <ul className="replay-coach-notes">
            {coachNotes.map((note) => (
              <li key={note.ply}>
                <button
                  type="button"
                  className="review-action"
                  onClick={() => {
                    navigate(note.replayPly);
                  }}
                >
                  {note.title}
                </button>
                <p>{note.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
