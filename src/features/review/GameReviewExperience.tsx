import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import {
  buildReviewCoachingRequest,
  prepareReviewCoaching,
  type ReviewCoachingResult,
} from "../../application/analyze-game/prepare-review-coaching";
import {
  commitCloseMove,
  commitOriginalMove,
  commitUnlabeledMove,
  completeAfterCloseFeedback,
  completeAfterOriginalFeedback,
  completeAfterUnlabeled,
  continueAfterCloseFeedback,
  continueAfterOriginalFeedback,
  retryCurrentMove,
  startReviewTraining,
  type ReviewTrainingState,
} from "../../application/analyze-game/review-training-session";
import {
  buildGameReplay,
  buildVariationFrames,
} from "../../domain/analysis/replay-game";
import {
  REVIEW_MOVE_TOLERANCE_CP,
  getAttemptFeedback,
  getThemeFeedback,
  type MoveAttemptScore,
  type ReviewTrainingLog,
} from "../../domain/analysis/review-training";
import type { LearningTheme } from "../../domain/analysis/types";
import type { GameRecord } from "../../domain/game/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { ReviewBoard } from "./ReviewBoard";
import "./game-review-experience.css";

type FeedbackLine = "attempt" | "verified";

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

const legalTargets = (fen: string, from: string): readonly string[] => {
  if (!isSquare(from)) return [];
  try {
    const chess = new Chess(fen);
    if (chess.get(from)?.color !== chess.turn()) return [];
    return chess.moves({ square: from, verbose: true }).map((move) => move.to);
  } catch {
    return [];
  }
};

const buildMove = (fen: string, from: string, to: string): string | null => {
  if (!isSquare(from) || !isSquare(to)) return null;
  try {
    const chess = new Chess(fen);
    if (chess.get(from)?.color !== chess.turn()) return null;
    const move = chess.move({ from, to, promotion: "q" });
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
};

const lineFrame = (
  fen: string,
  line: readonly string[],
  ply: number,
): { readonly fen: string; readonly lastMoveUci: string | null } => {
  const frames = buildVariationFrames(fen, line);
  const frame = frames.ok ? frames.frames[ply] : undefined;
  return { fen: frame?.fen ?? fen, lastMoveUci: frame?.lastMoveUci ?? null };
};

export interface GameReviewExperienceProps {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly coachProvider?: LessonContentProvider | null;
  readonly onTrainingComplete?: ((log: ReviewTrainingLog) => void) | null;
  readonly now?: () => string;
}

export function GameReviewExperience({
  game,
  analysis,
  coachProvider = null,
  onTrainingComplete = null,
  now = () => new Date().toISOString(),
}: GameReviewExperienceProps) {
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const [session, setSession] = useState<ReviewTrainingState | null>(() =>
    startReviewTraining(analysis),
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [feedbackLine, setFeedbackLine] = useState<FeedbackLine>("attempt");
  const [replayPly, setReplayPly] = useState(0);
  const deviceInitializationStarted = useRef(false);

  if (!replay.ok) return <p role="alert">{replay.message}</p>;
  if (session === null) {
    return (
      <section
        className="game-review game-review__empty"
        aria-labelledby="review-empty-title"
      >
        <h2 id="review-empty-title">No verified training set yet</h2>
        <p>You can still replay the completed game while analysis finishes.</p>
        <ReplayDetails
          game={game}
          replayFrames={replay.frames}
          replayPly={replayPly}
          setReplayPly={setReplayPly}
        />
      </section>
    );
  }

  const activeExercise =
    session.stage === "close-move" || session.stage === "close-feedback"
      ? session.closeExercise
      : session.stage === "unlabeled-move" ||
          session.stage === "unlabeled-feedback"
        ? session.unlabeledExercise
        : null;
  const activeFen = activeExercise?.fen ?? session.primaryFact.fenBefore;
  const targets =
    selectedSquare === null ? [] : legalTargets(activeFen, selectedSquare);

  const selectBoardSquare = (square: string): void => {
    if (targets.includes(square) && selectedSquare !== null) {
      setSelectedMove(buildMove(activeFen, selectedSquare, square));
      return;
    }
    const nextTargets = legalTargets(activeFen, square);
    setSelectedSquare(nextTargets.length > 0 ? square : null);
    setSelectedMove(null);
  };

  const clearMoveSelection = (): void => {
    setSelectedSquare(null);
    setSelectedMove(null);
  };

  const commitMove = (): void => {
    if (selectedMove === null) return;
    if (
      !deviceInitializationStarted.current &&
      coachProvider?.initializeDeviceModel !== undefined
    ) {
      deviceInitializationStarted.current = true;
      void coachProvider.initializeDeviceModel().catch(() => undefined);
    }
    setSession((current) => {
      if (current === null) return current;
      if (current.stage === "original-move")
        return commitOriginalMove(current, selectedMove);
      if (current.stage === "close-move")
        return commitCloseMove(current, selectedMove);
      return commitUnlabeledMove(current, selectedMove);
    });
    setFeedbackLine("attempt");
    clearMoveSelection();
  };

  const completeSession = (next: ReviewTrainingState): void => {
    setSession(next);
    if (next.stage === "complete") onTrainingComplete?.(next.log);
  };

  const undoAttempt = (): void => {
    setSession((current) =>
      current === null ? current : retryCurrentMove(current),
    );
    setFeedbackLine("attempt");
    clearMoveSelection();
  };

  return (
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <p className="game-review__eyebrow">Rewind challenge</p>
          <h2 id="game-review-title">Your game, rewound</h2>
        </div>
      </header>

      {session.stage === "original-move" ? (
        <MoveStage
          game={game}
          fen={session.primaryFact.fenBefore}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="Your turn again"
          title="Play it differently."
          description="The game has rewound to the critical moment. Play the move you wish you had chosen. Stockfish stays hidden until you move."
        />
      ) : null}

      {session.stage === "close-move" && session.closeExercise !== null ? (
        <MoveStage
          game={game}
          fen={session.closeExercise.fen}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="Optional challenge"
          title="Spot it again?"
          description={session.closeExercise.prompt}
        />
      ) : null}

      {session.stage === "unlabeled-move" &&
      session.unlabeledExercise !== null ? (
        <MoveStage
          game={game}
          fen={session.unlabeledExercise.fen}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="No hint this time"
          title="One more position?"
          description="Treat this like an ordinary game. Play the move that feels most urgent."
        />
      ) : null}

      {session.stage === "original-feedback" ? (
        <FeedbackStage
          game={game}
          gameId={session.primaryMoment.gameId}
          coachProvider={coachProvider}
          fen={session.primaryFact.fenBefore}
          score={session.originalScore}
          verifiedLine={
            session.primaryFact.candidates.find(
              (candidate) =>
                candidate.uci === session.originalScore?.bestMoveUci,
            )?.principalVariation ?? []
          }
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Move feedback"
          theme={session.primaryFact.theme}
          explanation={getThemeFeedback(session.primaryFact.theme)}
          nextLabel={
            session.closeExercise === null || session.unlabeledExercise === null
              ? undefined
              : "Practice this idea"
          }
          onNext={() => {
            completeSession(continueAfterOriginalFeedback(session, now()));
          }}
          onFinish={() => {
            completeSession(completeAfterOriginalFeedback(session, now()));
          }}
          onUndo={undoAttempt}
        />
      ) : null}

      {session.stage === "close-feedback" && session.closeExercise !== null ? (
        <FeedbackStage
          game={game}
          gameId={session.primaryMoment.gameId}
          coachProvider={coachProvider}
          fen={session.closeExercise.fen}
          score={session.closeScore}
          verifiedLine={session.closeExercise.verification.principalVariation}
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Move feedback"
          theme={session.primaryFact.theme}
          explanation={session.closeExercise.explanation}
          nextLabel="Practice without a hint"
          onNext={() => {
            setSession(continueAfterCloseFeedback(session));
            setFeedbackLine("attempt");
          }}
          onFinish={() => {
            completeSession(completeAfterCloseFeedback(session, now()));
          }}
          onUndo={undoAttempt}
        />
      ) : null}

      {session.stage === "unlabeled-feedback" &&
      session.unlabeledExercise !== null ? (
        <FeedbackStage
          game={game}
          gameId={session.primaryMoment.gameId}
          coachProvider={coachProvider}
          fen={session.unlabeledExercise.fen}
          score={session.unlabeledScore}
          verifiedLine={
            session.unlabeledExercise.verification.principalVariation
          }
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Move feedback"
          theme={session.primaryFact.theme}
          explanation={session.unlabeledExercise.explanation}
          onFinish={() => {
            completeSession(completeAfterUnlabeled(session, now()));
          }}
          onUndo={undoAttempt}
        />
      ) : null}

      {session.stage === "complete" ? (
        <TrainingSummary session={session} />
      ) : null}

      <ReplayDetails
        game={game}
        replayFrames={replay.frames}
        replayPly={replayPly}
        setReplayPly={setReplayPly}
      />

      {session.stage === "original-feedback" ||
      session.stage === "close-feedback" ||
      session.stage === "unlabeled-feedback" ||
      session.stage === "complete" ? (
        <details className="game-review__technical">
          <summary>Technical details</summary>
          <dl>
            <div>
              <dt>Original attempt</dt>
              <dd>
                {session.originalScore?.attemptedMoveUci ?? "Not committed"}
              </dd>
            </div>
            <div>
              <dt>Verified original move</dt>
              <dd>
                {session.originalScore?.bestMoveUci ??
                  session.primaryMoment.candidateMoveUci}
              </dd>
            </div>
            <div>
              <dt>Acceptance tolerance</dt>
              <dd>{String(REVIEW_MOVE_TOLERANCE_CP)} centipawns</dd>
            </div>
            <div>
              <dt>Analysis version</dt>
              <dd>{session.primaryMoment.analysisVersion}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function MoveStage({
  game,
  fen,
  selectedSquare,
  selectedMove,
  legalTargets,
  onSquareSelect,
  onCommit,
  eyebrow,
  title,
  description,
}: {
  readonly game: GameRecord;
  readonly fen: string;
  readonly selectedSquare: string | null;
  readonly selectedMove: string | null;
  readonly legalTargets: readonly string[];
  readonly onSquareSelect: (square: string) => void;
  readonly onCommit: () => void;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <TrainingStage
      board={
        <ReviewBoard
          fen={fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={selectedMove}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          onSquareSelect={onSquareSelect}
        />
      }
      eyebrow={eyebrow}
      title={title}
      description={description}
    >
      <p className="game-review__selection-status" role="status">
        {selectedMove === null
          ? selectedSquare === null
            ? "Select one of your pieces on the board."
            : "Now choose one of the marked legal destinations."
          : "Move ready. Play it when you are happy."}
      </p>
      <button
        className="game-review__primary"
        type="button"
        disabled={selectedMove === null}
        onClick={onCommit}
      >
        Play this move
      </button>
    </TrainingStage>
  );
}

function TrainingStage({
  board,
  eyebrow,
  title,
  description,
  children,
}: {
  readonly board: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="game-review__training-layout">
      <div className="game-review__board-stage">{board}</div>
      <div className="game-review__prompt">
        <p className="game-review__theme">{eyebrow}</p>
        <h3>{title}</h3>
        <p className="game-review__prompt-copy">{description}</p>
        {children}
      </div>
    </div>
  );
}

function FeedbackStage({
  game,
  gameId,
  coachProvider,
  fen,
  score,
  verifiedLine,
  line,
  setLine,
  eyebrow,
  theme,
  explanation,
  nextLabel,
  onNext,
  onFinish,
  onUndo,
}: {
  readonly game: GameRecord;
  readonly gameId: string;
  readonly coachProvider: LessonContentProvider | null;
  readonly fen: string;
  readonly score: MoveAttemptScore | null;
  readonly verifiedLine: readonly string[];
  readonly line: FeedbackLine;
  readonly setLine: (line: FeedbackLine) => void;
  readonly eyebrow: string;
  readonly theme: LearningTheme;
  readonly explanation: string;
  readonly nextLabel?: string | undefined;
  readonly onNext?: () => void;
  readonly onFinish: () => void;
  readonly onUndo: () => void;
}) {
  const [verifiedPly, setVerifiedPly] = useState(1);
  const [coachResult, setCoachResult] = useState<ReviewCoachingResult | null>(
    null,
  );
  const feedback =
    score === null ? null : getAttemptFeedback({ fen, theme, score });
  const feedbackSummary = feedback?.summary;
  useEffect(() => {
    if (
      score === null ||
      feedbackSummary === undefined ||
      coachProvider === null
    )
      return;
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
  if (score === null || feedback === null)
    return <p role="alert">This move was not scored.</p>;
  const boundedVerifiedPly = Math.min(
    Math.max(1, verifiedPly),
    Math.max(1, verifiedLine.length),
  );
  const frame = lineFrame(
    fen,
    line === "attempt" ? [score.attemptedMoveUci] : verifiedLine,
    line === "attempt" ? 1 : boundedVerifiedPly,
  );
  const canAdvanceLine =
    line === "verified" && boundedVerifiedPly < verifiedLine.length;
  return (
    <TrainingStage
      board={
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
      }
      eyebrow={eyebrow}
      title={feedback.title}
      description={feedback.summary}
    >
      <div className="game-review__learning-cue">
        <strong>Remember</strong>
        <p>{explanation}</p>
      </div>
      <HybridCoachNote provider={coachProvider} result={coachResult} />
      <div className="game-review__feedback-controls">
        <button
          className={
            score.accepted ? "game-review__secondary" : "game-review__primary"
          }
          type="button"
          onClick={onUndo}
        >
          {score.accepted ? "Undo and try another move" : "Undo and try again"}
        </button>
        {line === "attempt" ? (
          <button
            className="game-review__secondary"
            type="button"
            onClick={() => {
              setLine("verified");
              setVerifiedPly(1);
            }}
          >
            Show coach move
          </button>
        ) : (
          <button
            className="game-review__secondary"
            type="button"
            onClick={() => {
              setLine("attempt");
            }}
          >
            Back to my move
          </button>
        )}
      </div>
      {line === "verified" ? (
        <div className="game-review__line-player" aria-live="polite">
          <p>
            Move {String(boundedVerifiedPly)} of {String(verifiedLine.length)}
            {boundedVerifiedPly % 2 === 0 ? " - opponent's reply" : ""}
          </p>
          {canAdvanceLine ? (
            <button
              className="game-review__line-next"
              type="button"
              onClick={() => {
                setVerifiedPly((current) => current + 1);
              }}
            >
              {boundedVerifiedPly === 1
                ? "Show the opponent's reply"
                : "Show the next move"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="game-review__optional-actions">
        {score.accepted && nextLabel !== undefined && onNext !== undefined ? (
          <div>
            <span>Want more practice?</span>
            <button
              className="game-review__quiet-action"
              type="button"
              onClick={onNext}
            >
              {nextLabel}
            </button>
          </div>
        ) : null}
        <button
          className="game-review__quiet-action"
          type="button"
          onClick={onFinish}
        >
          Finish review
        </button>
      </div>
    </TrainingStage>
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
        Hybrid coach is preparing feedback…
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
        <>
          <strong>Hybrid coach</strong>
          <p>{result.note}</p>
        </>
      )}
      <small>Feedback source: {source}</small>
    </div>
  );
}

function TrainingSummary({
  session,
}: {
  readonly session: Extract<
    ReviewTrainingState,
    { readonly stage: "complete" }
  >;
}) {
  const { log } = session;
  const transferCount = [
    log.closeTransferScore,
    log.unlabeledTransferScore,
  ].filter((score) => score !== null && score !== undefined).length;
  return (
    <section
      className="game-review__summary"
      aria-labelledby="training-log-title"
    >
      <p className="game-review__eyebrow">Review complete</p>
      <h3 id="training-log-title">Take one cue into the next game</h3>
      <p className="game-review__summary-copy">
        You replayed the critical moment
        {transferCount === 0
          ? ". Similar positions will return naturally in future training."
          : ` and tested the idea in ${String(transferCount)} new ${transferCount === 1 ? "position" : "positions"}.`}
      </p>
      <div className="game-review__reinforcement">
        <strong>Your next-game cue</strong>
        <p>{log.nextGameReinforcement}</p>
      </div>
      <p className="game-review__due-note">
        ChessCue will bring this pattern back on {log.dueReview}.
      </p>
    </section>
  );
}

function ReplayDetails({
  game,
  replayFrames,
  replayPly,
  setReplayPly,
}: {
  readonly game: GameRecord;
  readonly replayFrames: readonly {
    readonly fen: string;
    readonly lastMoveUci: string | null;
  }[];
  readonly replayPly: number;
  readonly setReplayPly: (value: number) => void;
}) {
  const bounded = Math.min(replayPly, replayFrames.length - 1);
  const frame = replayFrames[bounded];
  if (frame === undefined) return null;
  return (
    <details className="game-review__replay">
      <summary>Replay the full game</summary>
      <div className="game-review__replay-content">
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
        <label htmlFor="game-review-ply">Move through the game</label>
        <input
          id="game-review-ply"
          type="range"
          min="0"
          max={String(Math.max(0, replayFrames.length - 1))}
          value={String(bounded)}
          onChange={(event) => {
            setReplayPly(Number(event.currentTarget.value));
          }}
        />
        <p>
          Position {String(bounded)} of {String(replayFrames.length - 1)}
        </p>
      </div>
    </details>
  );
}
