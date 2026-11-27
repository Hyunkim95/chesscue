import { LoadingText } from "../../shared/loading/LoadingState";
import { z } from "zod";
import { useEntryState } from "../../shared/navigation/history-entry";
import { RookMessage } from "../../shared/rook/RookMessage";
import { Chess } from "chess.js";
import { useEffect, useState, type ReactNode } from "react";

import type {
  ReviewReply,
  ReviewSearchPurpose,
} from "../../application/analyze-game/analyze-review-reply";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
import {
  buildReviewCoachingRequest,
  prepareReviewCoaching,
  type ReviewCoachingResult,
} from "../../application/analyze-game/prepare-review-coaching";
import {
  buildVariationFrames,
  MAX_GUIDED_PLIES,
  type ReplayFrame,
} from "../../domain/analysis/replay-game";
import {
  getAttemptFeedback,
  type MoveAttemptScore,
} from "../../domain/analysis/review-training";
import type { LearningTheme } from "../../domain/analysis/types";
import type { BoardCapture } from "../../domain/game/board-balance";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { BoardBalance } from "../board/BoardBalance";
import { describeReviewMove } from "./describe-review-move";
import { ReviewBoard } from "./ReviewBoard";
import "./game-review-experience.css";

export type AnalyzeReply = (
  fen: string,
  signal: AbortSignal,
  compareAlternatives?: boolean,
  purpose?: ReviewSearchPurpose,
) => Promise<ReviewReply | null>;

function validatedFrames(
  fen: string,
  line: readonly string[],
  initialCaptures: readonly BoardCapture[],
): readonly ReplayFrame[] {
  const replay = buildVariationFrames(
    fen,
    line.slice(0, MAX_GUIDED_PLIES),
    initialCaptures,
  );
  return replay.ok ? replay.frames : [];
}

export function TrainingStage({
  board,
  eyebrow,
  title,
  description,
  announce = false,
  showIntro = true,
  children,
}: {
  readonly board: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly announce?: boolean;
  readonly showIntro?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="game-review__training-layout">
      <div className="game-review__board-stage">{board}</div>
      <div className="game-review__prompt">
        {showIntro && (
          <div
            aria-live={announce ? "polite" : undefined}
            className="game-review__step"
          >
            <RookMessage context={eyebrow}>
              <h3>{title}</h3>
              <p className="game-review__prompt-copy">{description}</p>
            </RookMessage>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function GuidedMoveFeedback({
  gameId,
  coachProvider = null,
  analyzeReply = null,
  assessPosition = null,
  reviewedScores,
  initialCaptures = [],
  fen,
  score,
  verifiedLine,
  playedLine = [],
  knownLines = [],
  theme,
  explanation,
  nextLabel,
  onNext,
  onFinish,
  finishLabel = "Finish review",
  onUndo,
  children,
}: {
  readonly gameId: string;
  readonly coachProvider?: LessonContentProvider | null;
  readonly analyzeReply?: AnalyzeReply | null;
  readonly assessPosition?: AssessPosition | null;
  readonly initialCaptures?: readonly BoardCapture[] | undefined;
  readonly reviewedScores?: ReadonlyMap<string, number>;
  readonly fen: string;
  readonly score: MoveAttemptScore | null;
  readonly verifiedLine: readonly string[];
  readonly playedLine?: readonly string[];
  readonly knownLines?: readonly (readonly string[])[];
  readonly theme: LearningTheme;
  readonly explanation: string;
  readonly nextLabel?: string | undefined;
  readonly onNext?: () => void;
  readonly onFinish: () => void;
  readonly finishLabel?: string;
  readonly onUndo: () => void;
  readonly children?: ReactNode;
}) {
  const feedbackKey = "feedback:" + fen + ":" + (score?.attemptedMoveUci ?? "");
  const [ply, setPly] = useEntryState(
    feedbackKey + ":ply",
    z.number().int().nonnegative(),
    1,
  );
  const [line, setLine] = useEntryState(
    feedbackKey + ":line",
    z.enum(["attempt", "verified"]),
    "attempt",
  );
  const [replyResult, setReplyResult] = useState<{
    readonly fen: string;
    readonly moves: readonly string[];
  } | null>(null);
  const feedback =
    score === null ? null : getAttemptFeedback({ fen, theme, score });
  const attemptedMove = score?.attemptedMoveUci;
  const localAttempt =
    attemptedMove === undefined
      ? []
      : validatedFrames(fen, [attemptedMove], initialCaptures);
  const afterAttempt = localAttempt[1];
  const recordedAttempt = [playedLine, verifiedLine, ...knownLines]
    .filter((moves) => moves[0] === attemptedMove && moves.length > 1)
    .map((moves) => validatedFrames(fen, moves, initialCaptures))
    .find((frames) => frames.length > 2);
  const replyFen =
    recordedAttempt === undefined &&
    afterAttempt !== undefined &&
    !new Chess(afterAttempt.fen).isGameOver()
      ? afterAttempt.fen
      : null;
  useEffect(() => {
    if (analyzeReply === null || replyFen === null) return;
    const controller = new AbortController();
    void analyzeReply(replyFen, controller.signal)
      .then((reply) => {
        if (!controller.signal.aborted)
          setReplyResult({ fen: replyFen, moves: reply?.line ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setReplyResult({ fen: replyFen, moves: [] });
      });
    return () => {
      controller.abort();
    };
  }, [analyzeReply, replyFen]);
  if (score === null || feedback === null)
    return <p role="alert">This move was not scored.</p>;
  const reply = replyResult?.fen === replyFen ? replyResult.moves : [];
  const additionalAttempt =
    reply.length === 0
      ? []
      : validatedFrames(
          fen,
          [score.attemptedMoveUci, ...reply],
          initialCaptures,
        );
  const attempt =
    recordedAttempt ??
    (additionalAttempt.length > 0 ? additionalAttempt : localAttempt);
  const coach = validatedFrames(
    fen,
    verifiedLine.length === 0 ? [score.bestMoveUci] : verifiedLine,
    initialCaptures,
  );
  const frames = line === "attempt" ? attempt : coach;
  const current = Math.min(ply, frames.length - 1);
  const frame = frames[current];
  if (frame === undefined)
    return <p role="alert">This replay is unavailable.</p>;
  const previous = frames[current - 1];
  const before = previous === undefined ? null : new Chess(previous.fen);
  const step =
    before !== null && frame.lastMoveUci !== null
      ? describeReviewMove(before, before.move(frame.lastMoveUci))
      : "Look at the board before either side moves.";
  const learner = new Chess(fen).turn() === "w" ? "white" : "black";
  const otherSide = learner === "white" ? "Black" : "White";
  const canAdvance = current + 1 < frames.length;
  const waitingForReply =
    line === "attempt" &&
    current === 1 &&
    replyFen !== null &&
    analyzeReply !== null &&
    replyResult?.fen !== replyFen;
  const heading =
    frame.lastMoveSan === null
      ? "Before the move"
      : current === 1
        ? `${line === "attempt" ? "You played" : "Stockfish plays"} ${frame.lastMoveSan}`
        : `${current % 2 === 0 ? `${otherSide} replies` : learner === "white" ? "White plays" : "Black plays"} ${frame.lastMoveSan}`;
  const verdict =
    line === "verified"
      ? "Stockfish line"
      : score.evaluationGapCp === null
        ? "Your line"
        : feedback.title;
  const lineComplete = !canAdvance && !waitingForReply;
  const advance = {
    label:
      current === 0
        ? "Play the move"
        : current === 1
          ? "Play their reply"
          : "Next move",
    run: () => {
      setPly(current + 1);
    },
  };
  const compare =
    coach.length > 1
      ? {
          label: line === "attempt" ? "Show Stockfish move" : "Back to my move",
          run: () => {
            setLine(line === "attempt" ? "verified" : "attempt");
            setPly(1);
          },
        }
      : null;
  const rewind =
    current > 0
      ? {
          label: "Back one move",
          run: () => {
            setPly(current - 1);
          },
        }
      : null;
  const retry = { label: "Undo and try again", run: onUndo };
  const practice =
    score.accepted && nextLabel && onNext
      ? { label: nextLabel, run: onNext }
      : null;
  const finish = { label: finishLabel, run: onFinish };
  const compareFirst =
    line === "attempt" && compare && coach[1]?.lastMoveUci !== attemptedMove;
  const afterReplay = score.accepted
    ? (practice ?? finish)
    : compareFirst
      ? compare
      : retry;
  const primary = canAdvance ? advance : lineComplete ? afterReplay : null;
  const alternatives = [rewind, compare, retry, practice, finish].filter(
    (action): action is typeof finish => action !== null && action !== primary,
  );
  return (
    <TrainingStage
      board={
        <>
          <ReviewBoard
            fen={frame.fen}
            orientation={learner}
            lastMoveUci={frame.lastMoveUci}
          />
          <BoardBalance
            fen={frame.fen}
            captures={frame.captures}
            position={
              assessPosition === null
                ? undefined
                : {
                    assess: assessPosition,
                    knownWhiteCentipawns: reviewedScores?.get(frame.fen),
                  }
            }
          />
        </>
      }
      eyebrow={
        line === "attempt" && current > 1 && score.accepted
          ? "Your move was good"
          : verdict
      }
      title={heading}
      description={step}
      announce
    >
      <div className="game-review__line-player">
        <span>
          {current === 0
            ? "Starting position"
            : `Move ${String(current)} of ${String(frames.length - 1)}`}
        </span>
        {lineComplete && <strong>End of replay</strong>}
        {line === "attempt" &&
        playedLine.length > 1 &&
        playedLine[0] === attemptedMove &&
        recordedAttempt !== undefined ? (
          <span>From your game</span>
        ) : null}
      </div>
      {waitingForReply ? (
        <p className="game-review__line-player" role="status">
          <LoadingText>Checking their reply…</LoadingText>
        </p>
      ) : null}
      {primary && (
        <div className="game-review__feedback-controls">
          <button
            className="game-review__primary"
            type="button"
            onClick={primary.run}
          >
            {primary.label}
          </button>
        </div>
      )}
      <div className="game-review__optional-actions">
        {alternatives.map((action) => (
          <button
            key={action.label}
            type="button"
            className="game-review__quiet-action"
            onClick={action.run}
          >
            {action.label}
          </button>
        ))}
        {children}
      </div>
      <ReviewExplanation
        gameId={gameId}
        fen={fen}
        theme={theme}
        score={score}
        coachProvider={coachProvider}
        explanation={explanation}
      />
    </TrainingStage>
  );
}

export function ReviewExplanation({
  gameId,
  fen,
  theme,
  score,
  coachProvider,
  explanation,
}: {
  readonly gameId: string;
  readonly fen: string;
  readonly theme: LearningTheme;
  readonly score: MoveAttemptScore;
  readonly coachProvider: LessonContentProvider | null;
  readonly explanation: string;
}) {
  const [coachResult, setCoachResult] = useState<ReviewCoachingResult | null>(
    null,
  );
  const feedbackSummary =
    score.evaluationGapCp === null
      ? "This move is legal. Compare how both sides continue after it."
      : getAttemptFeedback({ fen, theme, score }).summary;
  useEffect(() => {
    if (coachProvider === null) return;
    const controller = new AbortController();
    const request = buildReviewCoachingRequest({
      gameId,
      fen,
      theme,
      score,
      deterministicExplanation: feedbackSummary,
    });
    void prepareReviewCoaching({
      request,
      accepted: score.accepted,
      provider: coachProvider,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) setCoachResult(result);
    });
    return () => {
      controller.abort();
    };
  }, [coachProvider, feedbackSummary, fen, gameId, score, theme]);
  return (
    <details className="game-review__technical">
      <summary>Why this matters</summary>
      <p>{explanation}</p>
      <HybridCoachNote provider={coachProvider} result={coachResult} />
    </details>
  );
}

function HybridCoachNote({
  provider,
  result,
}: {
  readonly provider: LessonContentProvider | null;
  readonly result: ReviewCoachingResult | null;
}) {
  if (provider === null) {
    return (
      <p className="game-review__provenance">
        Feedback source: verified local rules
      </p>
    );
  }
  if (result === null) {
    return (
      <p className="game-review__provenance" role="status">
        <LoadingText>Rook is preparing feedback…</LoadingText>
      </p>
    );
  }
  const source =
    result.provenance === "on-device"
      ? "Gemini Nano on device"
      : result.provenance === "cloud"
        ? "Gemini cloud fallback"
        : "verified local fallback";
  return (
    <div className="game-review__coach-note" aria-live="polite">
      {result.provenance === "deterministic" ? null : (
        <RookMessage>
          <p>{result.note}</p>
        </RookMessage>
      )}
      <small>Feedback source: {source}</small>
    </div>
  );
}
