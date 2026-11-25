import { Chess, type Square } from "chess.js";
import { useMemo, useRef, useState } from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
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
  type ReplayFrame,
} from "../../domain/analysis/replay-game";
import {
  REVIEW_MOVE_TOLERANCE_CP,
  getThemeFeedback,
  type ReviewTrainingLog,
} from "../../domain/analysis/review-training";
import type { GameRecord } from "../../domain/game/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { BoardBalance } from "../board/BoardBalance";
import { ReviewContinuation } from "./ReviewContinuation";
import { ReviewBoard } from "./ReviewBoard";
import {
  GuidedMoveFeedback,
  ReviewExplanation,
  TrainingStage,
  type AnalyzeReply,
} from "./GuidedMoveFeedback";
import type { BoardCapture } from "../../domain/game/board-balance";
import "./game-review-experience.css";

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

export interface GameReviewExperienceProps {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly coachProvider?: LessonContentProvider | null;
  readonly analyzeReply?: AnalyzeReply | null;
  readonly assessPosition?: AssessPosition | null;
  readonly onTrainingComplete?: ((log: ReviewTrainingLog) => void) | null;
  readonly now?: () => string;
}

export function GameReviewExperience({
  game,
  analysis,
  coachProvider = null,
  analyzeReply = null,
  assessPosition = null,
  onTrainingComplete = null,
  now = () => new Date().toISOString(),
}: GameReviewExperienceProps) {
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const reviewedScores = useMemo(() => {
    const values = new Map<string, number>();
    if (game.playerColor === null) return values;
    const perspective = game.playerColor === "white" ? 1 : -1;
    for (const fact of analysis.facts) {
      const before = game.moves[fact.ply - 2]?.fenAfter ?? game.initialFen;
      const played = game.moves[fact.ply - 1];
      if (before !== fact.fenBefore || played?.uci !== fact.playedMoveUci)
        continue;
      values.set(before, perspective * fact.evaluationBeforeCp);
      values.set(played.fenAfter, perspective * fact.evaluationAfterCp);
    }
    return values;
  }, [analysis.facts, game]);
  const [session, setSession] = useState<ReviewTrainingState | null>(() =>
    startReviewTraining(analysis),
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [rewind, setRewind] = useState(0);
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
          assessPosition={assessPosition}
          reviewedScores={reviewedScores}
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

  const initializeCoach = (): void => {
    if (
      !deviceInitializationStarted.current &&
      coachProvider?.initializeDeviceModel !== undefined
    ) {
      deviceInitializationStarted.current = true;
      void coachProvider.initializeDeviceModel().catch(() => undefined);
    }
  };
  const commitMove = (): void => {
    if (selectedMove === null) return;
    initializeCoach();
    setSession((current) => {
      if (current === null) return current;
      if (current.stage === "close-move")
        return commitCloseMove(current, selectedMove);
      return commitUnlabeledMove(current, selectedMove);
    });
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
    clearMoveSelection();
  };

  return (
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <h2 id="game-review-title">Your game, rewound</h2>
        </div>
      </header>

      {session.stage === "original-move" ||
      session.stage === "original-feedback" ? (
        <ReviewContinuation
          key={rewind}
          game={game}
          ply={session.primaryFact.ply}
          initialFact={session.primaryFact}
          analyzeReply={analyzeReply}
          onFirstMove={(uci) => {
            initializeCoach();
            setSession((current) =>
              current === null ? null : commitOriginalMove(current, uci),
            );
          }}
        >
          {session.originalScore !== null && (
            <>
              <div className="game-review__optional-actions">
                <button
                  type="button"
                  className="game-review__quiet-action"
                  onClick={() => {
                    setRewind((current) => current + 1);
                  }}
                >
                  Rewind again
                </button>
                {session.originalScore.accepted &&
                  session.closeExercise !== null && (
                    <button
                      type="button"
                      className="game-review__quiet-action"
                      onClick={() => {
                        completeSession(
                          continueAfterOriginalFeedback(session, now()),
                        );
                      }}
                    >
                      Try a similar position
                    </button>
                  )}
                <button
                  type="button"
                  className="game-review__quiet-action"
                  onClick={() => {
                    completeSession(
                      completeAfterOriginalFeedback(session, now()),
                    );
                  }}
                >
                  Finish review
                </button>
              </div>
              <ReviewExplanation
                gameId={game.id}
                fen={session.primaryFact.fenBefore}
                theme={session.primaryFact.theme}
                score={session.originalScore}
                coachProvider={coachProvider}
                explanation={getThemeFeedback(session.primaryFact.theme)}
              />
            </>
          )}
        </ReviewContinuation>
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

      {session.stage === "close-feedback" && session.closeExercise !== null ? (
        <GuidedMoveFeedback
          gameId={session.primaryMoment.gameId}
          coachProvider={coachProvider}
          analyzeReply={analyzeReply}
          assessPosition={assessPosition}
          fen={session.closeExercise.fen}
          score={session.closeScore}
          verifiedLine={session.closeExercise.verification.principalVariation}
          theme={session.primaryFact.theme}
          explanation={session.closeExercise.explanation}
          nextLabel="Practice without a hint"
          onNext={() => {
            setSession(continueAfterCloseFeedback(session));
          }}
          onFinish={() => {
            completeSession(completeAfterCloseFeedback(session, now()));
          }}
          onUndo={undoAttempt}
        />
      ) : null}

      {session.stage === "unlabeled-feedback" &&
      session.unlabeledExercise !== null ? (
        <GuidedMoveFeedback
          gameId={session.primaryMoment.gameId}
          coachProvider={coachProvider}
          analyzeReply={analyzeReply}
          assessPosition={assessPosition}
          fen={session.unlabeledExercise.fen}
          score={session.unlabeledScore}
          verifiedLine={
            session.unlabeledExercise.verification.principalVariation
          }
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
        assessPosition={assessPosition}
        reviewedScores={reviewedScores}
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
  captures = [],
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
  readonly captures?: readonly BoardCapture[] | undefined;
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
        <>
          <ReviewBoard
            fen={fen}
            orientation={game.playerColor ?? "white"}
            lastMoveUci={selectedMove}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            onSquareSelect={onSquareSelect}
          />
          <BoardBalance fen={fen} captures={captures} />
        </>
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
  assessPosition,
  reviewedScores,
  replayFrames,
  replayPly,
  setReplayPly,
}: {
  readonly game: GameRecord;
  readonly assessPosition: AssessPosition | null;
  readonly reviewedScores: ReadonlyMap<string, number>;
  readonly replayFrames: readonly ReplayFrame[];
  readonly replayPly: number;
  readonly setReplayPly: (value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bounded = Math.min(replayPly, replayFrames.length - 1);
  const frame = replayFrames[bounded];
  if (frame === undefined) return null;
  return (
    <details
      className="game-review__replay"
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
      }}
    >
      <summary>Replay the full game</summary>
      <div className="game-review__replay-content">
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
        {expanded ? (
          <BoardBalance
            fen={frame.fen}
            captures={frame.captures}
            position={
              assessPosition === null
                ? undefined
                : {
                    assess: assessPosition,
                    knownWhiteCentipawns: reviewedScores.get(frame.fen),
                  }
            }
          />
        ) : null}
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
