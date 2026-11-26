import { starterPack } from "../../domain/material/pack";
import { z } from "zod";
import { useEntryState } from "../../shared/navigation/history-entry";
import { Chess, type Square } from "chess.js";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import type { ReviewMistakeEvidence } from "../../domain/analysis/review-mistake";
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
import { observedGameMoves } from "../../domain/curriculum/game-drill";
import type { GameRecord } from "../../domain/game/types";
import { savedCoachMoments } from "../../domain/game/coach-moments";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { BoardBalance } from "../board/BoardBalance";
import { ReviewContinuation } from "./ReviewContinuation";
import { ReviewBoard } from "./ReviewBoard";
import { GameDebrief, type DebriefSelection } from "./GameDebrief";
import { RookExploration } from "../rook/RookExploration";
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

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
const progressSchema = z.object({
  stage: z.enum([
    "original-move",
    "original-feedback",
    "close-move",
    "close-feedback",
    "unlabeled-move",
    "unlabeled-feedback",
    "complete",
  ]),
  original: uciSchema.optional(),
  close: uciSchema.optional(),
  unlabeled: uciSchema.optional(),
  completedAt: z.iso.datetime().optional(),
});
function saveProgress(session: ReviewTrainingState | null) {
  return (
    session && {
      stage: session.stage,
      original: session.originalScore?.attemptedMoveUci,
      close: session.closeScore?.attemptedMoveUci,
      unlabeled: session.unlabeledScore?.attemptedMoveUci,
      completedAt: session.log?.completedAt,
    }
  );
}
function restoreProgress(
  analysis: CompletedGameAnalysis,
  saved: z.infer<typeof progressSchema>,
  gameTime: string,
) {
  let state = startReviewTraining(analysis);
  if (!state || !saved.original) return state;
  state = commitOriginalMove(state, saved.original);
  if (!state.originalScore?.legal) return startReviewTraining(analysis);
  if (saved.stage === "original-feedback" || saved.stage === "original-move")
    return state;
  if (saved.completedAt && !saved.close)
    return completeAfterOriginalFeedback(state, saved.completedAt);
  state = continueAfterOriginalFeedback(state, saved.completedAt ?? gameTime);
  if (!saved.close) return state;
  state = commitCloseMove(state, saved.close);
  if (saved.stage === "close-feedback") return state;
  if (saved.completedAt && !saved.unlabeled)
    return completeAfterCloseFeedback(state, saved.completedAt);
  state = continueAfterCloseFeedback(state);
  if (saved.unlabeled) state = commitUnlabeledMove(state, saved.unlabeled);
  return saved.completedAt
    ? completeAfterUnlabeled(state, saved.completedAt)
    : state;
}
export interface GameReviewExperienceProps {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly coachProvider?: LessonContentProvider | null;
  readonly analyzeReply?: AnalyzeReply | null;
  readonly assessPosition?: AssessPosition | null;
  readonly onTrainingComplete?: ((log: ReviewTrainingLog) => void) | null;
  readonly now?: () => string;
  readonly compact?: boolean;
  readonly reviewBack?: ReactNode;
  readonly reviewTitle?: string | undefined;
  readonly reviewSource?: ReactNode;
  readonly onMistake?: ((evidence: ReviewMistakeEvidence) => void) | undefined;
}

export function GameReviewExperience({
  game,
  analysis,
  coachProvider = null,
  analyzeReply = null,
  assessPosition = null,
  onTrainingComplete = null,
  now = () => new Date().toISOString(),
  compact = false,
  reviewBack,
  reviewTitle,
  reviewSource,
  onMistake,
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
  const [session, setSession] = useEntryState<ReviewTrainingState | null>(
    "review.progress:" + starterPack.runId,
    progressSchema.transform((saved) =>
      restoreProgress(analysis, saved, game.completedAt ?? game.createdAt),
    ),
    () => startReviewTraining(analysis),
    saveProgress,
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [rewind, setRewind] = useEntryState(
    "review.rewind",
    z.number().int().nonnegative(),
    0,
  );
  const [replayPly, setReplayPly] = useEntryState(
    "review.replayPly",
    z.number().int().nonnegative(),
    0,
  );
  const [replayExpanded, setReplayExpanded] = useEntryState(
    "review.replayOpen",
    z.boolean(),
    false,
  );
  const [practiceOpen, setPracticeOpen] = useEntryState(
    "review.practiceOpen",
    z.boolean(),
    false,
  );
  const [rookFrame, setRookFrame] = useState<ReplayFrame | null>(() => {
    if (!compact || !analyzeReply || !replay.ok) return null;
    const side = game.playerColor === "black" ? "b" : "w";
    const canPlay = ({ fen }: ReplayFrame) => {
      const position = new Chess(fen);
      return position.turn() === side && !position.isGameOver();
    };
    const turningPoint = session
      ? replay.frames[session.primaryFact.ply - 1]
      : undefined;
    if (turningPoint && canPlay(turningPoint)) return turningPoint;
    return (
      replay.frames.slice(0, -1).findLast(canPlay) ??
      replay.frames.findLast(canPlay) ??
      null
    );
  });
  const [debriefSelection, setDebriefSelection] =
    useEntryState<DebriefSelection>(
      "review.debriefFinding",
      z.object({
        finding: z.enum(["turning-point", "strong-move"]),
        replyShown: z.boolean(),
        replayPly: z.number().int().nonnegative().nullable().default(null),
      }),
      { finding: "turning-point", replyShown: false, replayPly: null },
    );
  const coachNotes = useMemo(() => savedCoachMoments(game), [game]);

  function closeRook() {
    setRookFrame(null);
  }
  useLayoutEffect(() => {
    if (!practiceOpen && !compact) return;
    const viewport = document.scrollingElement ?? document.documentElement;
    viewport.scrollTop = 0;
  }, [compact, practiceOpen, rookFrame]);

  const observations = useMemo(
    () => observedGameMoves(game, analysis),
    [game, analysis],
  );
  const strength = observations
    .filter((move) => move.outcome === "matched")
    .toSorted(
      (a, b) =>
        Number(b.drill.mateInOne === true) - Number(a.drill.mateInOne === true),
    )[0];
  const mistake = session?.primaryFact;
  const mistakeFrame =
    mistake === undefined ? undefined : game.moves[mistake.ply - 1];
  const reviewMarkers = [
    ...(strength
      ? [{ ply: strength.ply, label: "Strong move · " + strength.drill.played }]
      : []),
    ...(mistake && mistakeFrame
      ? [
          {
            ply: mistake.ply - 1,
            label: "Turning point · before " + mistakeFrame.san,
          },
        ]
      : []),
  ];
  const deviceInitializationStarted = useRef(false);

  const matchup = (reviewTitle ?? reviewSource) && (
    <p className="review-page__notice review-matchup">
      {reviewTitle && <span>{reviewTitle}</span>}
      {reviewSource}
    </p>
  );

  const reviewNavigation = reviewBack ? (
    <nav
      className={
        rookFrame
          ? "review-navigation review-navigation--exploring"
          : "review-navigation"
      }
      aria-label="Game review controls"
    >
      {reviewBack}
      {rookFrame && (
        <>
          {matchup}
          <button
            type="button"
            className="review-navigation__icon"
            aria-label="Game summary"
            title="Game summary"
            onClick={closeRook}
          >
            <span aria-hidden="true">▤</span>
          </button>
        </>
      )}
    </nav>
  ) : null;

  function withReviewNavigation(content: ReactNode) {
    if (!reviewNavigation) return content;
    return (
      <>
        {reviewNavigation}
        {!rookFrame && matchup}
        {content}
      </>
    );
  }

  if (!replay.ok)
    return withReviewNavigation(<p role="alert">{replay.message}</p>);
  const fullReplay = (
    <ReplayDetails
      game={game}
      assessPosition={assessPosition}
      reviewedScores={reviewedScores}
      replayFrames={replay.frames}
      replayPly={replayPly}
      setReplayPly={setReplayPly}
      reviewMarkers={reviewMarkers}
      expanded={replayExpanded}
      setExpanded={setReplayExpanded}
    />
  );
  if (rookFrame && analyzeReply) {
    const prior = replay.frames[rookFrame.ply - 1];
    const before = prior ? new Chess(prior.fen) : null;
    const caption =
      before && rookFrame.lastMoveSan
        ? "After " +
          String(before.moveNumber()) +
          (before.turn() === "w" ? ". " : "... ") +
          rookFrame.lastMoveSan
        : "Starting position";
    return withReviewNavigation(
      <RookExploration
        key={rookFrame.ply}
        fen={rookFrame.fen}
        originMoveUci={rookFrame.lastMoveUci}
        originCaption={caption}
        orientation={game.playerColor ?? "white"}
        analyzeReply={analyzeReply}
        assessPosition={assessPosition}
        {...(mistake?.fenBefore === rookFrame.fen
          ? { topic: mistake.theme }
          : {})}
        compact={compact}
        onMistake={onMistake}
        closeLabel="Back to game debrief"
        onClose={reviewBack ? undefined : closeRook}
      />,
    );
  }

  if (!practiceOpen || session === null) {
    return (
      <section
        className="game-review game-review--debrief"
        aria-labelledby="game-review-title"
      >
        <GameDebrief
          compact={compact}
          title={reviewTitle ?? (compact ? "Review" : "Game debrief")}
          source={reviewSource}
          navigation={reviewNavigation}
          frames={replay.frames}
          orientation={game.playerColor ?? "white"}
          strongPly={strength?.ply}
          turningPly={mistake?.ply}
          selection={debriefSelection}
          onSelect={setDebriefSelection}
          coachNotes={coachNotes}
          onExplore={analyzeReply ? setRookFrame : undefined}
          onPractice={
            mistake
              ? () => {
                  setPracticeOpen(true);
                }
              : undefined
          }
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

  return withReviewNavigation(
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <h2 id="game-review-title">Your game, rewound</h2>
          <button
            type="button"
            className="game-review__quiet-action"
            onClick={() => {
              setPracticeOpen(false);
            }}
          >
            Back to game debrief
          </button>
        </div>
      </header>

      {session.stage === "original-move" ||
      session.stage === "original-feedback" ? (
        <ReviewContinuation
          key={rewind}
          rewind={rewind}
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
          description={session.unlabeledExercise.prompt}
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
          {...(session.unlabeledExercise
            ? {
                nextLabel: "Practice without a hint",
                onNext: () => {
                  setSession(continueAfterCloseFeedback(session));
                },
              }
            : {})}
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

      {fullReplay}

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
    </section>,
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
  reviewMarkers,
  expanded,
  setExpanded,
}: {
  readonly game: GameRecord;
  readonly expanded: boolean;
  readonly setExpanded: (expanded: boolean) => void;
  readonly assessPosition: AssessPosition | null;
  readonly reviewedScores: ReadonlyMap<string, number>;
  readonly replayFrames: readonly ReplayFrame[];
  readonly replayPly: number;
  readonly setReplayPly: (value: number) => void;
  readonly reviewMarkers: readonly {
    readonly ply: number;
    readonly label: string;
  }[];
}) {
  const moments = useMemo(() => savedCoachMoments(game), [game]);
  const bounded = Math.min(replayPly, replayFrames.length - 1);
  const frame = replayFrames[bounded];
  if (frame === undefined) return null;
  return (
    <details
      className="game-review__replay"
      open={expanded}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
      }}
    >
      <summary>
        {moments.length > 0
          ? "Replay the game and saved coach notes"
          : "Replay the full game"}
      </summary>
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
        <div
          className="game-review__line-controls"
          aria-label="Replay controls"
          role="group"
        >
          <button
            type="button"
            disabled={bounded === 0}
            onClick={() => {
              setReplayPly(bounded - 1);
            }}
          >
            Previous move
          </button>
          <button
            type="button"
            disabled={bounded === replayFrames.length - 1}
            onClick={() => {
              setReplayPly(bounded + 1);
            }}
          >
            Next move
          </button>
        </div>
        {reviewMarkers.length > 0 && (
          <div
            className="game-review__line-controls"
            role="group"
            aria-label="Review moments"
          >
            {reviewMarkers.map(({ ply, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setReplayPly(ply);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {moments.length > 0 ? (
          <ul className="replay-coach-notes">
            {moments.map((note) => (
              <li key={note.ply}>
                <button
                  className="review-action"
                  type="button"
                  onClick={() => {
                    setReplayPly(note.replayPly);
                  }}
                >
                  {note.title}
                </button>
                <p>{note.detail}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
